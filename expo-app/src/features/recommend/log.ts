import { getState, setState } from "@/data/store";
import { metersBetweenLL, norm } from "@/lib/geo";
import { REC_CONFIG } from "@/lib/rec/config";
import { createDeliveryCache } from "@/lib/rec/delivery";
import { featureSnapshot, storedLogRank } from "@/lib/rec/snapshot";
import type { RecResult } from "@/lib/rec/pipeline";
import { supabase } from "@/lib/supabase";

/**
 * 「지금 뭐 먹지」 상호작용 로그(supabase/migrations/20261017000300_recommendation_logging.sql).
 * 세션 · 후보 줄은 화면에 실제로 처음 보인 순간에만 씁니다(점수 계산이 끝난 때가 아니라).
 * 로그가 실패해도(마이그레이션 전 포함) 추천 화면은 그대로 동작합니다. 원시 좌표는 보내지 않습니다.
 */

export type RecEvent =
  | "impression" | "detail_open" | "kakao_open" | "wish_start" | "wish_saved" | "navigate" | "visit_confirmed" | "refresh";

export type RecSession = {
  id: string;
  bookId: string | null;
  result: RecResult;
  /** 맥락 — 동네 이름 · 고른 기준인지 · 다시 추천 몇 번째인지(좌표 없음). */
  meta: { area: string | null; customPoint: boolean; customTime: boolean; refresh: number; kakao: "ok" | "partial" | "unavailable" };
};

/** 로그 id 용 UUID v4(보안 용도가 아닙니다). */
export const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const persisted = createDeliveryCache();
const impressions = createDeliveryCache();
const warn = (what: string, msg: string) => { if (__DEV__) console.warn(`추천 로그(${what}) 저장 안 됨:`, msg); };

/** 세션 + 후보 줄 — 한 번만. */
function persist(s: RecSession): Promise<boolean> {
  return persisted.run(s.id, async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    const r = s.result;
    const { error } = await supabase.from("rec_sessions").insert({
      id: s.id, user_id: data.session.user.id, book_id: s.bookId, algo_version: REC_CONFIG.version,
      context: {
        slot: r.ctx.slot, dow: r.ctx.dow, date: r.ctx.today, radius: r.radius, relax: r.relax.kind, cycled: r.cycled,
        filter: r.ctx.filter, couple: r.ctx.couple, weather: r.ctx.weather ? { precip: r.ctx.weather.precip, tempC: r.ctx.weather.tempC } : null,
        pool: r.diagnostics.pool, eligible: r.diagnostics.eligible, sources: r.diagnostics.bySource, ...s.meta,
        ranking: r.diagnostics.ranking, baselines: r.diagnostics.baselines, policy: r.policy,
      },
    });
    // Append-only tables: retry a partially delivered session without requiring UPDATE permission.
    if (error && error.code !== "23505") { warn("session", error.message); return false; }
    const shown = new Map(r.picks.map((p, i) => [p.c.key, i + 1]));
    const items = r.ranked.map((it, i) => ({
      session_id: s.id, candidate_key: it.c.key.slice(0, 300), position: shown.get(it.c.key) ?? null, rank: storedLogRank(it.baseRank ?? i + 1),
      kakao_id: it.c.kakaoId, rec_category: it.c.cat.recCat, distance_m: Math.min(50000, Math.round(it.c.distance)),
      score: it.score, features: featureSnapshot(it), sources: it.c.sources,
    }));
    const { error: e2 } = await supabase.from("rec_items").insert(items);
    if (e2 && e2.code !== "23505") { warn("items", e2.message); return false; }
    return true;
  });
}

/** 이벤트 하나. impression 은 세션 · 가게마다 한 번만. */
export async function logRec(
  s: RecSession | { id: string },
  type: RecEvent,
  opts: { key?: string; position?: number; recordId?: number; wishId?: string; payload?: Record<string, unknown> } = {},
) {
  const send = async () => {
    try {
      const ok = "result" in s ? await persist(s) : await (persisted.get(s.id) ?? Promise.resolve(true));
      if (!ok) return false;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return false;
      const { error } = await supabase.from("rec_events").insert({
        session_id: s.id, user_id: data.session.user.id, candidate_key: opts.key?.slice(0, 300) ?? null, position: opts.position ?? null,
        event_type: type, record_id: opts.recordId ?? null, wish_id: opts.wishId ?? null, payload: opts.payload ?? {},
      });
      if (error) warn(type, error.message);
      return !error;
    } catch (error) { warn(type, String(error)); return false; }
  };
  if (type === "impression") await impressions.run(`${s.id}|${opts.key}`, send);
  else await send();
}

/** 화면에 보인 카드를 기억해 둡니다 — 나중에 그 가게를 인증하면 이 세션과 잇습니다(visit_confirmed). */
export function rememberShown(s: RecSession, position: number) {
  const p = s.result.picks[position - 1];
  if (!p) return;
  const prev = getState().recShown.filter((x) => Date.now() - x.at < SHOWN_TTL_MS && !(x.sessionId === s.id && x.key === p.c.key));
  setState({ recShown: [...prev.slice(-29), { sessionId: s.id, key: p.c.key, position, name: p.c.name, lat: p.c.lat, lng: p.c.lng, at: Date.now() }] });
}

/** 보인 뒤 이 시간 안의 인증만 추천에서 온 방문으로 봅니다. */
const SHOWN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 기록이 올라간 직후(촬영 인증) — 최근 보인 추천 카드 중 같은 가게(이름 + 100m)가 있으면 visit_confirmed.
 * 「여기로 갈게요」를 눌렀는지(navigate)는 payload.via 로 구분합니다. 만족도는 record_id 로 기록의 별점과 나중에 잇습니다.
 */
export function linkVisit(rec: { recordId: number; name: string; lat: number | null; lng: number | null; verified: boolean }) {
  const { recShown, recHeading } = getState();
  const hit = [...recShown].reverse().find((x) =>
    Date.now() - x.at < SHOWN_TTL_MS && norm(x.name) === norm(rec.name) &&
    (rec.lat == null || rec.lng == null || metersBetweenLL(x.lat, x.lng, rec.lat, rec.lng) <= REC_CONFIG.sameBranchM));
  if (!hit) return;
  const via = recHeading?.sessionId === hit.sessionId && recHeading.placeKey === hit.key ? "navigate" : "shown";
  void logRec({ id: hit.sessionId }, "visit_confirmed", {
    key: hit.key, position: hit.position, recordId: rec.recordId,
    payload: { via, verified: rec.verified, hours_since_shown: Math.round(((Date.now() - hit.at) / 3600000) * 10) / 10 },
  });
  setState({ recShown: recShown.filter((x) => x !== hit) });
}

import { deliverOutbox } from "@/lib/reliability/outbox";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getState, setState, type RecShown } from "@/data/store";
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
  ownerId: string;
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
    if (!data.session || data.session.user.id !== s.ownerId) return false;
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
    if ((await supabase.auth.getSession()).data.session?.user.id !== s.ownerId) return false;
    const { error: e2 } = await supabase.from("rec_items").insert(items);
    if (e2 && e2.code !== "23505") { warn("items", e2.message); return false; }
    return true;
  });
}

/** 이벤트 하나. impression 은 세션 · 가게마다 한 번만. */
export async function logRec(
  s: RecSession | { id: string },
  type: RecEvent,
  opts: { eventId?: string; ownerId?: string; key?: string; position?: number; recordId?: number; wishId?: string; payload?: Record<string, unknown> } = {},
) {
  const eventId = opts.eventId ?? uuid();
  const expectedOwner = opts.ownerId ?? ("ownerId" in s ? s.ownerId : undefined);
  const send = async () => {
    try {
      const ok = "result" in s ? await persist(s) : await (persisted.get(s.id) ?? Promise.resolve(true));
      if (!ok) return false;
      const { data } = await supabase.auth.getSession();
      if (!data.session || (expectedOwner && data.session.user.id !== expectedOwner)) return false;
      const { error } = await supabase.from("rec_events").insert({
        client_event_id: eventId, session_id: s.id, user_id: data.session.user.id, candidate_key: opts.key?.slice(0, 300) ?? null, position: opts.position ?? null,
        event_type: type, record_id: opts.recordId ?? null, wish_id: opts.wishId ?? null, payload: opts.payload ?? {},
      });
      if (error && error.code !== "23505") warn(type, error.message);
      return !error || error.code === "23505";
    } catch (error) { warn(type, String(error)); return false; }
  };
  if (type === "impression") return impressions.run(`${s.id}|${opts.key}`, send);
  return send();
}

const SHOWN_TTL_MS = 12 * 60 * 60 * 1000;
let shownOwner: string | null = null;
let writes: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const result = writes.then(task, task);
  writes = result.catch(() => {});
  return result;
};
const shownKey = (owner: string) => `rec.shown:${owner}`;
const visitsKey = (owner: string) => `rec.pending-visits:${owner}`;
async function readShown(owner: string): Promise<RecShown[]> {
  try {
    const raw = JSON.parse(await AsyncStorage.getItem(shownKey(owner)) ?? "[]") as RecShown[];
    return Array.isArray(raw) ? raw.filter((r) => typeof r.sessionId === "string" && typeof r.key === "string" && typeof r.name === "string" && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Number.isFinite(r.at) && Date.now() - r.at >= 0 && Date.now() - r.at < SHOWN_TTL_MS).slice(-30) : [];
  } catch { return []; }
}
export async function restoreShown(owner: string | null) {
  shownOwner = owner;
  setState({ recShown: [] });
  if (!owner) return;
  const rows = await serial(() => readShown(owner));
  if (shownOwner === owner) setState({ recShown: rows });
}
export async function rememberShown(s: RecSession, position: number) {
  const p = s.result.picks[position - 1];
  const owner = (await supabase.auth.getSession()).data.session?.user.id;
  if (!p || !owner || s.ownerId !== owner || shownOwner !== owner) return;
  await serial(async () => {
    const previous = await readShown(owner);
    const rows = [...previous.filter((x) => !(x.sessionId === s.id && x.key === p.c.key)).slice(-29), { sessionId: s.id, key: p.c.key, position, name: p.c.name, lat: p.c.lat, lng: p.c.lng, at: Date.now() }];
    await AsyncStorage.setItem(shownKey(owner), JSON.stringify(rows));
    if (shownOwner === owner) setState({ recShown: rows });
  });
}
export type VisitHint = { ownerId: string; eventId: string; sessionId: string; key: string; position: number; shownAt: number; capturedAt: number; via: string };
export async function visitAttribution(rec: { name: string; lat: number | null; lng: number | null }, at = Date.now()): Promise<VisitHint | null> {
  const ownerId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!ownerId) return null;
  const rows = await serial(() => readShown(ownerId));
  const hit = [...rows].reverse().find((x) => at >= x.at && at - x.at < SHOWN_TTL_MS && norm(x.name) === norm(rec.name) &&
    rec.lat != null && rec.lng != null && metersBetweenLL(x.lat, x.lng, rec.lat, rec.lng) <= REC_CONFIG.sameBranchM);
  if (!hit) return null;
  const heading = getState().recHeading;
  return { ownerId, eventId: uuid(), sessionId: hit.sessionId, key: hit.key, position: hit.position, shownAt: hit.at, capturedAt: at,
    via: heading?.sessionId === hit.sessionId && heading.placeKey === hit.key ? "navigate" : "shown" };
}
type PendingVisit = { hint: VisitHint; recordId: number; verified: boolean };
async function readVisits(owner: string): Promise<PendingVisit[]> {
  const raw = JSON.parse(await AsyncStorage.getItem(visitsKey(owner)) ?? "[]");
  if (!Array.isArray(raw)) throw new Error("invalid_pending_visits");
  return raw;
}
/** Persist a small visit-delivery outbox before capture queue cleanup. Other event types remain best-effort. */
export async function queueVisit(hint: VisitHint | null, recordId: number, verified: boolean) {
  if (!hint) return true;
  if ((await supabase.auth.getSession()).data.session?.user.id !== hint.ownerId) return false;
  await serial(async () => {
    const rows = await readVisits(hint.ownerId);
    if (!rows.some((r) => r.hint.eventId === hint.eventId)) rows.push({ hint, recordId, verified });
    await AsyncStorage.setItem(visitsKey(hint.ownerId), JSON.stringify(rows));
  });
  void flushVisits(hint.ownerId).catch(() => {});
  return true;
}
export async function flushVisits(owner: string) {
  return serial(() => deliverOutbox<PendingVisit>({
    read: () => readVisits(owner),
    write: (rows) => AsyncStorage.setItem(visitsKey(owner), JSON.stringify(rows)),
    key: (visit) => visit.hint.eventId,
    send: async (visit) => {
      if ((await supabase.auth.getSession()).data.session?.user.id !== owner) return false;
      const h = visit.hint;
      return logRec({ id: h.sessionId }, "visit_confirmed", { eventId: h.eventId, ownerId: owner, key: h.key, position: h.position, recordId: visit.recordId,
        payload: { via: h.via, verified: visit.verified, hours_since_shown: Math.round((h.capturedAt - h.shownAt) / 360000) / 10 } });
    },
    delivered: async (visit) => {
      const h = visit.hint;
      const shown = (await readShown(owner)).filter((r) => !(r.sessionId === h.sessionId && r.key === h.key));
      await AsyncStorage.setItem(shownKey(owner), JSON.stringify(shown));
      if (shownOwner === owner) setState({ recShown: shown });
    },
  }));
}
export async function linkVisit(rec: { recordId: number; name: string; lat: number | null; lng: number | null; verified: boolean }) {
  const hint = await visitAttribution(rec);
  return queueVisit(hint, rec.recordId, rec.verified);
}

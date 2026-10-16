import type { PlaceStat, RecCategory, RecFilter } from "../recommend";
import type { Restaurant, Wish } from "../types";
import { buildPool, mealRows, type Candidate, type KakaoPlace, type Source } from "./candidates";
import { recordCategory } from "./categories";
import { REC_CONFIG } from "./config";
import { byScore, mmr } from "./mmr";
import { score, type RecContext, type Scored, type Weather } from "./score";
import { bookScoped, buildTaste } from "./taste";
import { mealSlotOf, seoulClock } from "./time";

/**
 * 「지금 뭐 먹지」 세 단계 — A 후보 모으기(candidates.ts) → B 점수(score.ts) → C 다양성 다시 고르기(mmr.ts).
 * 순수 함수라 같은 입력이면 같은 5곳입니다. 「다시 추천」은 avoid(앞서 보여 준 곳)를 넘겨 다른 5곳을 고릅니다.
 * 점수 단계는 나중에 학습한 랭커(LambdaMART 등)로 바꿔 끼울 수 있게 score 하나로만 이어져 있습니다.
 */

export type Relax =
  | { kind: "strict" }
  | { kind: "wider"; radius: number }
  | { kind: "mine" };

export type RecInput = {
  here: { lat: number; lng: number };
  at: Date;
  filter: RecFilter;
  couple: boolean;
  bookId: string | null;
  /** 서버 카카오 후보와, 그 후보를 찾은 가장 넓은 반경 — 못 받았으면 kakaoRadius = null. */
  kakao: KakaoPlace[];
  kakaoRadius: number | null;
  stats: PlaceStat[];
  rows: Restaurant[];
  wishes: Wish[];
  notes?: { record_id: number; rating: number | null }[];
  weather: Weather | null;
  /** 앞서 보여 준 가게 key — 「다시 추천」. */
  avoid?: string[];
};

export type RecResult = {
  picks: Scored[];
  relax: Relax;
  radius: number;
  /** 카카오 후보를 더 넓게 받아야 하면 그 반경(부르는 쪽이 받아서 다시 넘깁니다). */
  wantRadius: number | null;
  /** 앞서 보여 준 곳까지 다시 써야 5곳이 찼는지. */
  cycled: boolean;
  /** 점수 순 상위(로그 · 진단용) — 고른 5곳을 포함합니다. */
  ranked: Scored[];
  ctx: RecContext;
  diagnostics: { pool: number; eligible: number; bySource: Record<Source, number> };
};

/** 강한 조건 — 먹고 싶은 것이 있으면 그 종류만, 빼고 싶은 것은 늘 뺍니다. 식사 자리가 아니면 뺍니다. */
export const eligible = (c: Candidate, filter: RecFilter) => {
  if (!c.cat.eligible || !Number.isFinite(c.distance)) return false;
  const cat = c.cat.recCat;
  return filter.inc.length ? !!cat && filter.inc.includes(cat) : !cat || !filter.exc.includes(cat);
};

export function buildContext(input: RecInput): RecContext {
  const clock = seoulClock(input.at);
  const taste = buildTaste({ rows: input.rows, wishes: input.wishes, bookId: input.bookId, today: clock.date, notes: input.notes });
  const recent = mealRows(bookScoped(input.rows, input.bookId)).map((r) => ({ date: r.visited_at!, cat: recordCategory(r.category, r.name, r.kind).recCat as RecCategory | null }));
  return { today: clock.date, dow: clock.dow, slot: mealSlotOf(clock.minutes), taste, filter: input.filter, couple: input.couple, weather: input.weather, recent };
}

export function recommend(input: RecInput): RecResult {
  const cfg = REC_CONFIG;
  const ctx = buildContext(input);
  const rows = bookScoped(input.rows, input.bookId);
  const wishes = bookScoped(input.wishes, input.bookId);
  const poolAt = (radius: number) => buildPool({ here: input.here, radius, kakao: input.kakao, stats: input.stats, rows, wishes });

  // A — 1.5km 에서 시작해 걸러진 후보가 모자라면 3km.
  let radius: number = cfg.radii[0];
  let pool = poolAt(radius);
  let ok = pool.filter((c) => eligible(c, input.filter));
  for (const r of cfg.radii.slice(1)) {
    if (ok.length >= cfg.minPool) break;
    radius = r;
    pool = poolAt(r);
    ok = pool.filter((c) => eligible(c, input.filter));
  }
  const wantRadius = input.kakaoRadius != null && radius > input.kakaoRadius ? radius : null;

  // B — 점수.
  const scored = ok.map((c) => score(c, ctx)).sort(byScore);

  // C — 앞서 보여 준 곳은 빼고 MMR. 모자라면 앞서 보여 준 곳도 다시.
  const requested = input.filter.inc.length > 0;
  const avoid = new Set(input.avoid ?? []);
  const fresh = scored.filter((s) => !avoid.has(s.c.key));
  let picks = mmr(fresh, cfg.count, { requested });
  let cycled = false;
  if (picks.length < cfg.count && avoid.size) {
    const again = mmr(scored.filter((s) => avoid.has(s.c.key)), cfg.count - picks.length, { requested });
    cycled = again.length > 0;
    picks = [...picks, ...again];
  }

  // 그래도 모자라면 10km 안의 내 위시 · 두 번 넘게 간 곳(남의 숫자 없이).
  let relax: Relax = radius > cfg.radii[0] ? { kind: "wider", radius } : { kind: "strict" };
  if (picks.length < cfg.count) {
    const taken = new Set(picks.map((p) => p.c.key));
    const mine = poolAt(cfg.mineRadius)
      .filter((c) => !taken.has(c.key) && !pool.some((p) => p.key === c.key) && eligible(c, input.filter))
      .filter((c) => c.wish || new Set(c.visits.map((r) => r.visited_at)).size >= 2)
      .map((c) => score({ ...c, stat: null }, ctx));
    const more = mmr(mine, cfg.count - picks.length, { requested });
    if (more.length) relax = { kind: "mine" };
    picks = [...picks, ...more];
  }

  const bySource: Record<Source, number> = { kakao: 0, community: 0, history: 0, wish: 0 };
  for (const c of pool) for (const s of c.sources) bySource[s] += 1;
  const ranked = [...new Map([...picks, ...scored.slice(0, 20)].map((s) => [s.c.key, s])).values()];
  return { picks, relax, radius, wantRadius, cycled, ranked, ctx, diagnostics: { pool: pool.length, eligible: ok.length, bySource } };
}

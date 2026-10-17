import type { RecResult } from "./pipeline";
import type { Scored } from "./score";

/** No raw locations, record text, or fabricated quality labels in ranking snapshots. */
export function featureSnapshot(s: Scored) {
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    x: Object.fromEntries(Object.entries(s.x).map(([k, v]) => [k, r4(v)])),
    rep: { place: r4(s.repetition.place), cuisine: r4(s.repetition.cuisine) },
    visits: s.c.visits.length, wish: !!s.c.wish, community_users: s.c.stat?.users ?? null,
    base_rank: s.baseRank ?? null,
    cuisine: s.c.cat.cuisine ?? null, dish: s.c.cat.dish ?? null,
    evidence: s.evidence,
    selection: s.selection ?? null,
  };
}

/** Existing DB contract caps rank at 100; the uncensored value lives in features.base_rank. */
export const storedLogRank = (rank: number) => Math.min(100, Math.max(1, rank));

/** Same keys can have different book/context/features. They must not reuse an old log session. */
export function resultSignature(result: RecResult, basis: string) {
  return JSON.stringify({
    basis, date: result.ctx.today, dow: result.ctx.dow, slot: result.ctx.slot, filter: result.ctx.filter,
    weather: result.ctx.weather, radius: result.radius, relax: result.relax, cycled: result.cycled,
    policy: result.policy,
    picks: result.picks.map((s) => s.c.key),
    ranked: result.ranked.map((s) => [s.c.key, s.score, s.baseRank, featureSnapshot(s)]),
    diagnostics: result.diagnostics,
  });
}

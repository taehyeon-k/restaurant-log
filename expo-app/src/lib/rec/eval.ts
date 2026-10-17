import { byScore, mmr, similarity } from "./mmr";
import type { Candidate } from "./candidates";
import { REC_CONFIG, type ComponentKey } from "./config";
import type { Scored } from "./score";

/**
 * 오프라인 진단 — 시뮬레이션 · 로그 재생에 씁니다. 여기 숫자는 실제 사용자 성과가 아닙니다.
 * 나중에 rec_items · rec_events 로그(방문 · 위시 저장 = 관련도)로 NDCG@5 를 잴 수 있게 ndcgAt 을 둡니다.
 */

/** 여러 번 추천한 결과가 후보 전체의 몇 %를 덮었는지. */
export function coverage(lists: Candidate[][], catalog: Candidate[]) {
  if (!catalog.length) return 0;
  const seen = new Set(lists.flat().map((c) => c.key));
  return seen.size / catalog.length;
}

/** Diversity@k — 고른 곳끼리 평균 (1 − 유사도). 1 이면 서로 전혀 닮지 않음. */
export function diversityAt(picks: Candidate[], k = 5) {
  const top = picks.slice(0, k);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) { sum += 1 - similarity(top[i], top[j], false); n++; }
  return n ? sum / n : 0;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};

export function distanceDistribution(picks: Candidate[]) {
  const d = picks.map((c) => c.distance);
  return { n: d.length, mean: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0, p50: quantile(d, 0.5), p90: quantile(d, 0.9), max: d.length ? Math.max(...d) : 0 };
}

export function cuisineDistribution(picks: Candidate[]) {
  const out: Record<string, number> = {};
  for (const c of picks) out[c.cat.recCat ?? "모름"] = (out[c.cat.recCat ?? "모름"] ?? 0) + 1;
  return out;
}

/** 후보 모으기 완전성 — 반경 안에 있다고 아는 가게(정답 key) 중 후보에 든 비율. */
export function retrievalCompleteness(pool: Candidate[], known: string[]) {
  if (!known.length) return 1;
  const keys = new Set(pool.flatMap((c) => [c.key, c.kakaoId ? `kakao:${c.kakaoId}` : ""]));
  return known.filter((k) => keys.has(k)).length / known.length;
}

/**
 * 성분별 평균 · 표준편차 · 변별 몫. 변별 몫 = 후보 사이 w·x 의 표준편차 비율 — 모든 후보에 같은 값이면 순위에 영향이 없으니 0.
 * 한 성분이 순위를 독차지하는지 봅니다(감점 R 도 포함).
 */
export function componentDiagnostics(scored: Scored[]) {
  const keys = Object.keys(REC_CONFIG.weights) as ComponentKey[];
  const sdOf = (xs: number[]) => {
    if (!xs.length) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  const rows = [
    ...keys.map((k) => ({ k: k as string, x: scored.map((s) => s.x[k]), wx: scored.map((s) => REC_CONFIG.weights[k] * s.x[k]) })),
    { k: "repetition", x: scored.map((s) => s.repetition.place + s.repetition.cuisine), wx: scored.map((s) => s.repetition.place + s.repetition.cuisine) },
  ];
  // 모든 성분이 후보마다 같으면(콜드 스타트 등) 몫은 모두 0 — 부동소수 잡음끼리 나누지 않게.
  const sum = rows.reduce((t, r) => t + sdOf(r.wx), 0);
  const total = sum < 1e-9 ? Infinity : sum;
  return Object.fromEntries(rows.map((r) => {
    const mean = r.x.length ? r.x.reduce((a, b) => a + b, 0) / r.x.length : 0;
    return [r.k, { mean, sd: sdOf(r.x), share: sdOf(r.wx) / total }];
  })) as Record<ComponentKey | "repetition", { mean: number; sd: number; share: number }>;
}

export const SCORE_GROUPS = {
  personalFit: ["taste"],
  desirability: ["wish", "favorite", "community"],
  practicality: ["distance", "meal", "context"],
  discovery: ["novelty"],
} as const;

/** Group contributions are measured relative to neutral, with repetition in discovery. */
export function groupDiagnostics(scored: Scored[]) {
  return Object.fromEntries(Object.entries(SCORE_GROUPS).map(([group, keys]) => {
    const values = scored.map((s) => keys.reduce((sum, key) => sum + s.contrib[key], 0) -
      (group === "discovery" ? s.repetition.place + s.repetition.cuisine : 0));
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return [group, { mean, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 }];
  }));
}

/** Counterfactual diagnostics, not causal attribution: remove one signal and rerun MMR. */
export function rankingDiagnostics(scored: Scored[], requested: boolean, k = 5) {
  const original = mmr(scored, k, { requested }).map((s) => s.c.key);
  const keys = [...Object.keys(REC_CONFIG.weights), "repetition"] as (ComponentKey | "repetition")[];
  const ablations = Object.fromEntries(keys.map((key) => {
    const modified = scored.map((s) => ({ ...s, score: s.score + (key === "repetition" ? s.repetition.place + s.repetition.cuisine : -s.contrib[key]) }));
    const alternative = mmr(modified, k, { requested }).map((s) => s.c.key);
    return [key, {
      replaced: alternative.filter((id) => !original.includes(id)).length,
      positionsChanged: alternative.filter((id, i) => id !== original[i]).length,
    }];
  }));
  return { components: componentDiagnostics(scored), groups: groupDiagnostics(scored), ablations };
}

/** Same-pool baselines. previousKeys must come from archived v3 output/logs, not a v4 approximation. */
export function compareRankers(scored: Scored[], opts: { requested?: boolean; k?: number; previousKeys?: readonly string[]; relevance?: Record<string, number> } = {}) {
  const k = opts.k ?? REC_CONFIG.count;
  const lists: { name: string; picks: Scored[] }[] = [
    { name: "distance-only", picks: [...scored].sort((a, b) => a.c.distance - b.c.distance || byScore({ ...a, score: 0 }, { ...b, score: 0 })).slice(0, k) },
    { name: "distance-wishlist", picks: [...scored].sort((a, b) =>
      (0.22 * b.x.distance + 0.1 * b.x.wish) - (0.22 * a.x.distance + 0.1 * a.x.wish) ||
      byScore({ ...a, score: 0 }, { ...b, score: 0 })).slice(0, k) },
    { name: REC_CONFIG.version, picks: mmr(scored, k, { requested: opts.requested ?? false }) },
  ];
  if (opts.previousKeys) {
    const by = new Map(scored.map((s) => [s.c.key, s]));
    lists.push({ name: "archived-v3", picks: opts.previousKeys.flatMap((key) => by.has(key) ? [by.get(key)!] : []).slice(0, k) });
  }
  return lists.map(({ name, picks }) => ({
    name, keys: picks.map((s) => s.c.key),
    distance: distanceDistribution(picks.map((s) => s.c)),
    diversity: diversityAt(picks.map((s) => s.c), k),
    cuisines: cuisineDistribution(picks.map((s) => s.c)),
    // Current feature values applied to every baseline; these are descriptive, not outcome labels.
    meanTaste: picks.length ? picks.reduce((sum, s) => sum + s.x.taste, 0) / picks.length : 0,
    ...(opts.relevance ? {
      judgedCoverage: picks.length ? picks.filter((s) => Object.hasOwn(opts.relevance!, s.c.key)).length / picks.length : 0,
      ndcg: picks.length && picks.every((s) => Object.hasOwn(opts.relevance!, s.c.key)) ? ndcgAt(picks.map((s) => s.c.key), opts.relevance, k) : null,
    } : {}),
  }));
}

export type OutcomeEvent = {
  sessionId: string; type: "impression" | "visit_confirmed" | "wish_saved" | "refresh" | "navigate" | "detail_open";
  verified?: boolean; recordId?: number; rating?: number | null;
};

/** Association metrics on exposed sessions; a linked visit is not proof of incremental impact. */
export function outcomeSummary(sessions: { id: string; algoVersion: string }[], events: OutcomeEvent[]) {
  return [...new Set(sessions.map((s) => s.algoVersion))].sort().map((algoVersion) => {
    const ids = new Set(sessions.filter((s) => s.algoVersion === algoVersion).map((s) => s.id));
    const exposed = new Set(events.filter((e) => ids.has(e.sessionId) && e.type === "impression").map((e) => e.sessionId));
    const observed = events.filter((e) => exposed.has(e.sessionId));
    const count = (predicate: (e: OutcomeEvent) => boolean) => new Set(observed.filter(predicate).map((e) => e.sessionId)).size;
    const visits = count((e) => e.type === "visit_confirmed" && e.verified === true);
    const saved = count((e) => e.type === "wish_saved");
    const chose = new Set(observed.filter((e) => ["visit_confirmed", "wish_saved", "navigate"].includes(e.type)).map((e) => e.sessionId));
    const ratings = new Map<number, number>();
    for (const e of observed) if (e.type === "visit_confirmed" && e.verified && e.recordId != null && e.rating != null && Number.isFinite(e.rating) && e.rating >= 1 && e.rating <= 5) ratings.set(e.recordId, e.rating);
    return {
      algoVersion, exposedSessions: exposed.size, verifiedVisitSessions: visits,
      visitRate: exposed.size ? visits / exposed.size : null,
      savedWishlistSessions: saved, saveRate: exposed.size ? saved / exposed.size : null,
      refreshWithoutChoiceSessions: count((e) => e.type === "refresh" && !chose.has(e.sessionId)),
      ratedVisits: ratings.size,
      meanVisitRating: ratings.size ? [...ratings.values()].reduce((a, b) => a + b, 0) / ratings.size : null,
    };
  });
}

/** NDCG@k — ranked: 보여 준 순서의 key, rel: key → 관련도(예: 방문 3, 위시 저장 2, 상세 열기 1). 안 본 곳은 음의 라벨이 아니라 빠진 것으로 둡니다. */
export function ndcgAt(ranked: string[], rel: Record<string, number>, k = 5) {
  const dcg = ranked.slice(0, k).reduce((s, key, i) => s + ((2 ** (rel[key] ?? 0)) - 1) / Math.log2(i + 2), 0);
  const ideal = Object.values(rel).sort((a, b) => b - a).slice(0, k).reduce((s, r, i) => s + ((2 ** r) - 1) / Math.log2(i + 2), 0);
  return ideal ? dcg / ideal : 0;
}

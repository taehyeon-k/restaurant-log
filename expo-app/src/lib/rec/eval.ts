import { similarity } from "./mmr";
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

/** NDCG@k — ranked: 보여 준 순서의 key, rel: key → 관련도(예: 방문 3, 위시 저장 2, 상세 열기 1). 안 본 곳은 음의 라벨이 아니라 빠진 것으로 둡니다. */
export function ndcgAt(ranked: string[], rel: Record<string, number>, k = 5) {
  const dcg = ranked.slice(0, k).reduce((s, key, i) => s + ((2 ** (rel[key] ?? 0)) - 1) / Math.log2(i + 2), 0);
  const ideal = Object.values(rel).sort((a, b) => b - a).slice(0, k).reduce((s, r, i) => s + ((2 ** r) - 1) / Math.log2(i + 2), 0);
  return ideal ? dcg / ideal : 0;
}

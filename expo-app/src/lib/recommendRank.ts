import { samePlace } from "./geo";
import type { Restaurant, Wish } from "./types";

export type Candidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
  category: string | null;
  detailCategory: string;
  url: string | null;
};

export type RecommendationContext = {
  meal: "lunch" | "dinner";
  excludedCategories?: string[];
  /** 기상 제공자가 연결되면 전달합니다. 현재는 undefined로 두어 날씨를 추정하지 않습니다. */
  weather?: { raining: boolean; temperatureC?: number };
  /** '다시 추천' 시 후보 중 동점인 식당의 순서를 약하게 변화시킵니다. */
  variant?: number;
};
export type RankedCandidate = Candidate & {
  score: number;
  reason: string;
  isWish: boolean;
  isVisited: boolean;
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const dayDiff = (date: string | null, now: number) =>
  date ? Math.max(0, Math.floor((now - new Date(date).getTime()) / 86400000)) : 365;

function stableNoise(text: string, variant: number) {
  let n = 2166136261;
  for (const ch of `${variant}:${text}`) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return ((n >>> 0) / 4294967295 - 0.5) * 0.045;
}

function placeMatch(place: Candidate, record: Restaurant | Wish) {
  return samePlace({
    name: record.name, address: "where_text" in record ? record.where_text : record.address,
    lat: record.lat, lng: record.lng,
  }, place);
}

/**
 * 작은 데이터셋에서도 작동하는 explainable baseline.
 * 선택/방문 라벨을 학습한 모델이 아니므로 결과를 성공 확률로 표시하지 않습니다.
 */
export function rankRestaurants(
  candidates: Candidate[], rows: Restaurant[], wishes: Wish[], context: RecommendationContext, now = Date.now(),
  count = 5,
): RankedCandidate[] {
  const history = rows.filter((r) => !r.pending && !!r.visited_at && r.kind === "restaurant");
  const categoryStats = new Map<string, { positive: number; weight: number; count: number; meals: Record<string, number> }>();
  for (const r of history) {
    if (!r.category) continue;
    const stats = categoryStats.get(r.category) ?? { positive: 0, weight: 0, count: 0, meals: { lunch: 0, dinner: 0 } };
    const recency = 1 / (1 + dayDiff(r.visited_at, now) / 180);
    const confidence = r.verified_at ? 1 : 0.65;
    const weight = confidence * recency;
    // 평점을 주지 않은 기록은 약한 중립 신호. 평점 2 이하의 반복 추천을 피합니다.
    const positive = r.rating == null ? 0.53 : clamp(Number(r.rating) / 5);
    stats.positive += weight * (r.revisit && (r.rating == null || r.rating >= 3.5) ? Math.max(positive, 0.80) : positive);
    stats.weight += weight;
    stats.count += 1;
    if (r.verified_at) {
      const h = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23",
      }).format(new Date(r.verified_at)));
      stats.meals[h < 15 ? "lunch" : "dinner"] += 1;
    }
    categoryStats.set(r.category, stats);
  }

  const filtered = candidates.filter((r) =>
    !context.excludedCategories?.includes(r.category ?? "") &&
    Number.isFinite(r.distanceM) && r.distanceM >= 0 && r.distanceM <= 3000
  );
  const scored: RankedCandidate[] = filtered.map((r) => {
    const stats = categoryStats.get(r.category ?? "");
    const taste = stats ? (1 + stats.positive) / (2 + stats.weight) : 0.5;
    const proximity = Math.exp(-r.distanceM / 950);
    const matches = history.filter((h) => placeMatch(r, h));
    const lastVisit = matches.reduce((min, h) => Math.min(min, dayDiff(h.visited_at, now)), Infinity);
    const recentVisitPenalty = lastVisit < 14 ? 0.23 : lastVisit < 30 ? 0.10 : 0;
    const wish = wishes.some((w) => placeMatch(r, w));
    const novelty = matches.length === 0 ? 1 : lastVisit > 90 ? 0.55 : 0.1;
    const meal = stats && stats.meals.lunch + stats.meals.dinner >= 3
      ? (stats.meals[context.meal] + 1) / (stats.meals.lunch + stats.meals.dinner + 2)
      : 0.5;
    // 날씨는 거리와의 interaction. 비 오는 날 무조건 국밥을 추천하는 편견성 규칙은 넣지 않습니다.
    const rainPenalty = context.weather?.raining ? clamp((r.distanceM - 450) / 1800) * 0.08 : 0;
    const score = 0.42 * taste + 0.26 * proximity + 0.11 * (wish ? 1 : 0) +
      0.08 * novelty + 0.08 * meal + 0.05 * (matches.some((v) => v.revisit) ? 1 : 0) -
      recentVisitPenalty - rainPenalty + stableNoise(r.id, context.variant ?? 0);
    let reason: string;
    if (wish) reason = "위시리스트에 담아 둔 곳";
    else if (matches.length && matches.some((v) => v.revisit)) reason = "또 가고 싶다고 기록한 곳";
    else if (stats && stats.count >= 2 && taste >= 0.56) reason = `기록에서 선호도가 높은 ${r.category}`;
    else if (r.distanceM <= 450) reason = "가까워서 부담 없는 선택";
    else reason = "새롭게 발견할 수 있는 식당";
    return { ...r, score, reason, isWish: wish, isVisited: matches.length > 0 };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Greedy MMR. 비슷한 선택지만 다섯 개 나오지 않도록 선호도 대비 다양성을 조정합니다.
  const chosen: RankedCandidate[] = [];
  const pool = [...scored];
  while (chosen.length < count && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const r = pool[i];
      const penalty = chosen.reduce((largest, c) =>
        Math.max(largest,
          r.category && r.category === c.category ? 0.085 : 0,
          r.name === c.name ? 0.22 : 0,
        ), 0);
      const value = r.score - penalty;
      if (value > bestValue) { bestValue = value; bestIndex = i; }
    }
    chosen.push(pool.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

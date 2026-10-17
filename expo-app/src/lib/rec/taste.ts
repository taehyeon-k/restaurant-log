import type { RecCategory } from "../recommend";
import type { Restaurant, Wish } from "../types";
import { norm } from "../geo";
import { mealRows, kakaoIdOf } from "./candidates";
import { dishOf, recordCategory, type CategoryInfo } from "./categories";
import { REC_CONFIG } from "./config";
import { routineMultiplier } from "./routine";
import { dayDiff, mealSlotOf, seoulClock, type MealSlot } from "./time";

/**
 * Algorithm A — 베이지안으로 수축한 종류별 취향.
 *   T(u,c) = (κ·μ0 + Σ wᵢ·yᵢ) / (κ + Σ wᵢ)
 * yᵢ: absolute satisfaction mixed with rating relative to the user's mean.
 * Evidence is capped per restaurant; dish preferences shrink toward their cuisine parent.
 * 별점 없는 기록은 거의 중립인 약한 관측(불확실),
 *     「다시 갈래요」만 있으면 약한 긍정. revisit = false 는 싫다는 뜻이 아니라 표시하지 않은 것이라 쓰지 않습니다.
 * wᵢ: 최근성(exp(−age/τ), 바닥 있음) × 신뢰도(위치 인증 1, 아니면 0.8) × 관측 종류 무게.
 * 방문 횟수는 만족과 다르니 별점 없는 방문을 여러 번 해도 T 는 중립 근처에 머뭅니다.
 * 기록장 하나(개인 또는 연인)의 기록만 씁니다 — 다른 기록장 기록이 섞여 들어와도 bookId 로 걸러 냅니다.
 */

export type CatTaste = {
  T: number; weight: number; rated: number; visits: number;
  positivePlaces: number; revisitPlaces: number; confidence: number;
};
export type TasteProfile = {
  cats: Map<RecCategory, CatTaste>;
  cuisines: Map<string, CatTaste>;
  dishes: Map<string, CatTaste>;
  routineByCat: Map<RecCategory, number>;
  /** 수축한 평균 별점 — 「평소보다」의 기준. */
  userMean: number;
  /** 쓴 식사 기록 수 — 0 이면 콜드 스타트. */
  meals: number;
  /** 인증 시각이 있는 식사의 시간대 분포 — 종류별 · 전체. */
  slots: { all: Record<MealSlot, number>; byCat: Map<RecCategory, Record<MealSlot, number>> };
  ratingOf: (r: Restaurant) => number | null;
};

/** 기록장 하나로 좁힙니다. bookId 가 null 이면(마이그레이션 전) 그대로. */
export const bookScoped = <T extends { book_id?: string | null }>(list: T[], bookId: string | null) =>
  bookId ? list.filter((x) => x.book_id === bookId) : list;

/**
 * 별점 — 연인 기록장이면 두 사람 메모(record_notes)의 평균(둘의 공통 취향), 없으면 기록의 별점.
 * 개인 기록장에는 notes 를 넘기지 않습니다.
 */
export function ratingFn(notes?: { record_id: number; rating: number | null }[]) {
  const by = new Map<number, number[]>();
  for (const n of notes ?? []) if (validRating(n.rating)) by.set(n.record_id, [...(by.get(n.record_id) ?? []), Number(n.rating)]);
  return (r: Restaurant) => {
    const list = by.get(r.id);
    if (list?.length) return list.reduce((a, b) => a + b, 0) / list.length;
    return validRating(r.rating) ? Number(r.rating) : null;
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const validRating = (r: number | null): r is number => r != null && Number.isFinite(Number(r)) && Number(r) >= 1 && Number(r) <= 5;

/** Prefer stable identity. A location suffix separates same-name branches without an address. */
export const tastePlaceKey = (r: Restaurant) => kakaoIdOf(r.place_url) ?? r.place_key ??
  `${norm(r.name)}|${r.address ? norm(r.address) : `${r.lat?.toFixed(3) ?? "?"},${r.lng?.toFixed(3) ?? "?"}`}`;

type Observation = { wy: number; w: number; rated: boolean; revisit: boolean; visits: number };
type Acc = Map<string, Map<string, Observation>>;
function accumulate(acc: Acc, category: string | null, place: string, w: number, y: number, rated: boolean, revisit: boolean, visit = true) {
  if (!category) return;
  const places = acc.get(category) ?? new Map<string, Observation>();
  const a = places.get(place) ?? { wy: 0, w: 0, rated: false, revisit: false, visits: 0 };
  a.wy += w * y; a.w += w; a.rated ||= rated; a.revisit ||= revisit; a.visits += visit ? 1 : 0;
  places.set(place, a);
  acc.set(category, places);
}

function summarize(places: Map<string, Observation>, prior: number, kappa: number): CatTaste {
  let wy = 0, weight = 0, rated = 0, visits = 0, positivePlaces = 0, revisitPlaces = 0;
  for (const a of places.values()) {
    const w = Math.min(a.w, REC_CONFIG.taste.maxWeightPerPlace);
    const y = a.w ? a.wy / a.w : prior;
    wy += w * y; weight += w; rated += a.rated ? 1 : 0; visits += a.visits;
    positivePlaces += a.rated && y > 0.5 ? 1 : 0;
    revisitPlaces += a.revisit && y > 0.5 ? 1 : 0;
  }
  return { T: (kappa * prior + wy) / (kappa + weight), weight, rated, visits, positivePlaces, revisitPlaces, confidence: weight / (kappa + weight) };
}

const dishKey = (c: CategoryInfo) => c.dish ? `${c.cuisine ?? c.base ?? c.recCat ?? "?"}|${c.dish}` : null;

/** Absolute satisfaction prevents a generous rater's good meals becoming dislikes. */
export const ratingSignal = (rating: number, userMean: number) => {
  const mix = REC_CONFIG.taste.absoluteRatingMix;
  return mix * clamp01((rating - 1) / 4) + (1 - mix) * clamp01(0.5 + (rating - userMean) / 4);
};

export function buildTaste(opts: {
  rows: Restaurant[]; wishes: Wish[]; bookId: string | null; today: string;
  notes?: { record_id: number; rating: number | null }[];
}): TasteProfile {
  const cfg = REC_CONFIG.taste;
  const ratingOf = ratingFn(opts.notes);
  const meals = mealRows(bookScoped(opts.rows, opts.bookId)).filter((r) => dayDiff(r.visited_at!, opts.today) >= 0)
    .sort((a, b) => tastePlaceKey(a).localeCompare(tastePlaceKey(b)) || a.id - b.id);
  const wishes = bookScoped(opts.wishes, opts.bookId);

  const byPlace = new Map<string, number[]>();
  for (const r of meals) {
    const rating = ratingOf(r);
    if (rating != null) byPlace.set(tastePlaceKey(r), [...(byPlace.get(tastePlaceKey(r)) ?? []), rating]);
  }
  const ratings = [...byPlace.values()].map((rs) => rs.reduce((a, b) => a + b, 0) / rs.length);
  const userMean = (ratings.reduce((a, b) => a + b, 0) + cfg.ratingPrior * cfg.ratingPriorN) / (ratings.length + cfg.ratingPriorN);

  const acc: Acc = new Map(), cuisineAcc: Acc = new Map(), dishAcc: Acc = new Map();
  const rowsByCat = new Map<RecCategory, Restaurant[]>();

  const slotAll: Record<MealSlot, number> = { lunch: 0, dinner: 0, other: 0 };
  const slotBy = new Map<RecCategory, Record<MealSlot, number>>();

  for (const r of meals) {
    const info = recordCategory(r.category, r.name, r.kind, r.menus?.length ? r.menus.map((m) => m.name) : r.menu ? [r.menu] : []);
    const c = info.recCat;
    if (!c) continue;
    rowsByCat.set(c, [...(rowsByCat.get(c) ?? []), r]);
    const age = Math.max(0, dayDiff(r.visited_at!, opts.today));
    const recency = Math.max(cfg.recencyFloor, Math.exp(-age / cfg.recencyTauDays));
    const conf = r.verified_at ? 1 : cfg.unverifiedConfidence;
    const rating = ratingOf(r);
    const y = rating != null ? ratingSignal(rating, userMean) : r.revisit ? cfg.revisitOnly.y : cfg.unrated.y;
    const w = recency * conf * (rating != null ? 1 : r.revisit ? cfg.revisitOnly.w : cfg.unrated.w);
    const place = tastePlaceKey(r);
    accumulate(acc, c, place, w, y, rating != null, r.revisit);
    accumulate(cuisineAcc, info.cuisine ?? null, place, w, y, rating != null, r.revisit);
    const voted = new Map<string, number[]>();
    for (const menu of r.menus ?? []) {
      const dish = dishOf(menu.name);
      if (dish && (menu.vote === 1 || menu.vote === -1)) {
        voted.set(dish, [...(voted.get(dish) ?? []), menu.vote === 1 ? cfg.dishVote.positive : cfg.dishVote.negative]);
      }
    }
    if (voted.size) {
      // An explicit menu dislike must not inherit the restaurant's good overall rating.
      for (const [dish, values] of voted) accumulate(dishAcc, dishKey({ ...info, dish }), place,
        recency * conf * cfg.dishVote.weight, values.reduce((a, b) => a + b, 0) / values.length, true, false);
    } else accumulate(dishAcc, dishKey(info), place, w, y, rating != null, r.revisit);

    // 식사 시간대는 서버가 찍은 인증 시각만 믿습니다 — visited_at 은 날짜뿐입니다.
    if (r.verified_at) {
      const slot = mealSlotOf(seoulClock(new Date(r.verified_at)).minutes);
      slotAll[slot] += 1;
      const s = slotBy.get(c) ?? { lunch: 0, dinner: 0, other: 0 };
      s[slot] += 1;
      slotBy.set(c, s);
    }
  }

  const wishPerCat = new Map<RecCategory, number>();
  const wishPerCuisine = new Map<string, number>();
  for (const w of [...wishes].sort((a, b) => a.id.localeCompare(b.id))) {
    const info = recordCategory(w.category, w.name);
    const c = info.recCat;
    if (!c) continue;
    const n = wishPerCat.get(c) ?? 0;
    if (n >= cfg.wish.maxPerCat) continue;
    wishPerCat.set(c, n + 1);
    accumulate(acc, c, `wish:${w.id}`, cfg.wish.w, cfg.wish.y, false, false, false);
    if (info.cuisine && (wishPerCuisine.get(info.cuisine) ?? 0) < cfg.wish.maxPerCat) {
      wishPerCuisine.set(info.cuisine, (wishPerCuisine.get(info.cuisine) ?? 0) + 1);
      accumulate(cuisineAcc, info.cuisine, `wish:${w.id}`, cfg.wish.w, cfg.wish.y, false, false, false);
    }
  }

  const cats = new Map<RecCategory, CatTaste>();
  for (const [c, places] of acc) cats.set(c as RecCategory, summarize(places, cfg.prior, cfg.kappa));
  const cuisines = new Map([...cuisineAcc].map(([c, places]) => [c, summarize(places, cfg.prior, cfg.kappa)]));
  const dishes = new Map([...dishAcc].map(([key, places]) => [key, summarize(places, cuisines.get(key.split("|")[0])?.T ?? cats.get(key.split("|")[0] as RecCategory)?.T ?? cfg.prior, cfg.dishKappa)]));
  const routineByCat = new Map([...rowsByCat].map(([c, rs]) => [c, routineMultiplier(rs, opts.today, ratingOf)]));
  return { cats, cuisines, dishes, routineByCat, userMean, meals: meals.length, slots: { all: slotAll, byCat: slotBy }, ratingOf };
}

/** 종류의 취향 점수 — 모르는 종류 · 기록 없는 종류는 사전값 μ0. */
export const tasteOf = (p: TasteProfile, c: RecCategory | null) => (c ? p.cats.get(c)?.T ?? REC_CONFIG.taste.prior : REC_CONFIG.taste.prior);

/** Hierarchical shrinkage: dish → cuisine → neutral. Unknown cuisine uses the legacy food group. */
export function preferenceFor(p: TasteProfile, c: CategoryInfo) {
  const cuisine = c.cuisine ?? c.base;
  const parent = cuisine ? p.cuisines.get(cuisine) : c.recCat ? p.cats.get(c.recCat) : undefined;
  const key = dishKey(c);
  const dish = key ? p.dishes.get(key) : undefined;
  const evidence = dish ?? parent;
  return {
    value: evidence?.T ?? REC_CONFIG.taste.prior,
    confidence: evidence?.confidence ?? 0,
    level: dish ? "dish" : parent ? "cuisine" : "unknown",
    label: dish ? c.dish! : cuisine ?? c.recCat,
    ratedPlaces: evidence?.rated ?? 0,
    positivePlaces: evidence?.positivePlaces ?? 0,
    revisitPlaces: evidence?.revisitPlaces ?? 0,
  };
}

/**
 * 사용자 쪽 식사 시간대 적합도 — 이 종류를 이 시간대에 먹은 비율이 평소 비율보다 얼마나 높은지(lift).
 *   affinity = (n_c,slot + k·p_slot)/(n_c + k), lift = affinity / p_slot, 결과 = lift/(1+lift) (lift 1 → 0.5).
 * 「그 밖」 시간대이거나 인증 시각이 없으면 0.5(중립).
 */
export function slotFit(p: TasteProfile, c: RecCategory | null, slot: MealSlot) {
  if (slot === "other" || !c) return 0.5;
  const all = p.slots.all;
  const total = all.lunch + all.dinner + all.other;
  if (!total) return 0.5;
  const pSlot = (all[slot] + 1) / (total + 3);
  const by = p.slots.byCat.get(c);
  const n = by ? by.lunch + by.dinner + by.other : 0;
  const k = REC_CONFIG.meal.betaK;
  const affinity = ((by?.[slot] ?? 0) + k * pSlot) / (n + k);
  const lift = affinity / pSlot;
  return lift / (1 + lift);
}

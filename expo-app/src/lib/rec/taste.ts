import type { RecCategory } from "../recommend";
import type { Restaurant, Wish } from "../types";
import { mealRows } from "./candidates";
import { recordCategory } from "./categories";
import { REC_CONFIG } from "./config";
import { dayDiff, mealSlotOf, seoulClock, type MealSlot } from "./time";

/**
 * Algorithm A — 베이지안으로 수축한 종류별 취향.
 *   T(u,c) = (κ·μ0 + Σ wᵢ·yᵢ) / (κ + Σ wᵢ)
 * yᵢ: 별점을 사용자 평균에 견준 값(0.5 = 평소만큼). 별점 없는 기록은 거의 중립인 약한 관측(불확실),
 *     「다시 갈래요」만 있으면 약한 긍정. revisit = false 는 싫다는 뜻이 아니라 표시하지 않은 것이라 쓰지 않습니다.
 * wᵢ: 최근성(exp(−age/τ), 바닥 있음) × 신뢰도(위치 인증 1, 아니면 0.8) × 관측 종류 무게.
 * 방문 횟수는 만족과 다르니 별점 없는 방문을 여러 번 해도 T 는 중립 근처에 머뭅니다.
 * 기록장 하나(개인 또는 연인)의 기록만 씁니다 — 다른 기록장 기록이 섞여 들어와도 bookId 로 걸러 냅니다.
 */

export type CatTaste = { T: number; weight: number; rated: number; visits: number };
export type TasteProfile = {
  cats: Map<RecCategory, CatTaste>;
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
  for (const n of notes ?? []) if (n.rating != null) by.set(n.record_id, [...(by.get(n.record_id) ?? []), Number(n.rating)]);
  return (r: Restaurant) => {
    const list = by.get(r.id);
    if (list?.length) return list.reduce((a, b) => a + b, 0) / list.length;
    return r.rating == null ? null : Number(r.rating);
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 별점 → 선호 신호 y(0–1). 평균 별점이면 0.5, 1점 차이마다 0.25. */
export const ratingSignal = (rating: number, userMean: number) => clamp01(0.5 + (rating - userMean) / 4);

export function buildTaste(opts: {
  rows: Restaurant[]; wishes: Wish[]; bookId: string | null; today: string;
  notes?: { record_id: number; rating: number | null }[];
}): TasteProfile {
  const cfg = REC_CONFIG.taste;
  const ratingOf = ratingFn(opts.notes);
  const meals = mealRows(bookScoped(opts.rows, opts.bookId));
  const wishes = bookScoped(opts.wishes, opts.bookId);

  const ratings = meals.map(ratingOf).filter((x): x is number => x != null);
  const userMean = (ratings.reduce((a, b) => a + b, 0) + cfg.ratingPrior * cfg.ratingPriorN) / (ratings.length + cfg.ratingPriorN);

  const acc = new Map<RecCategory, { wy: number; w: number; rated: number; visits: number }>();
  const bump = (c: RecCategory, w: number, y: number, rated: boolean, visit: boolean) => {
    const a = acc.get(c) ?? { wy: 0, w: 0, rated: 0, visits: 0 };
    a.wy += w * y; a.w += w; a.rated += rated ? 1 : 0; a.visits += visit ? 1 : 0;
    acc.set(c, a);
  };

  const slotAll: Record<MealSlot, number> = { lunch: 0, dinner: 0, other: 0 };
  const slotBy = new Map<RecCategory, Record<MealSlot, number>>();

  for (const r of meals) {
    const c = recordCategory(r.category, r.name, r.kind).recCat;
    if (!c) continue;
    const age = Math.max(0, dayDiff(r.visited_at!, opts.today));
    const recency = Math.max(cfg.recencyFloor, Math.exp(-age / cfg.recencyTauDays));
    const conf = r.verified_at ? 1 : cfg.unverifiedConfidence;
    const rating = ratingOf(r);
    if (rating != null) bump(c, recency * conf, ratingSignal(rating, userMean), true, true);
    else if (r.revisit) bump(c, recency * conf * cfg.revisitOnly.w, cfg.revisitOnly.y, false, true);
    else bump(c, recency * conf * cfg.unrated.w, cfg.unrated.y, false, true);

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
  for (const w of wishes) {
    const c = recordCategory(w.category, w.name).recCat;
    if (!c) continue;
    const n = wishPerCat.get(c) ?? 0;
    if (n >= cfg.wish.maxPerCat) continue;
    wishPerCat.set(c, n + 1);
    bump(c, cfg.wish.w, cfg.wish.y, false, false);
  }

  const cats = new Map<RecCategory, CatTaste>();
  for (const [c, a] of acc) {
    cats.set(c, { T: (cfg.kappa * cfg.prior + a.wy) / (cfg.kappa + a.w), weight: a.w, rated: a.rated, visits: a.visits });
  }
  return { cats, userMean, meals: meals.length, slots: { all: slotAll, byCat: slotBy }, ratingOf };
}

/** 종류의 취향 점수 — 모르는 종류 · 기록 없는 종류는 사전값 μ0. */
export const tasteOf = (p: TasteProfile, c: RecCategory | null) => (c ? p.cats.get(c)?.T ?? REC_CONFIG.taste.prior : REC_CONFIG.taste.prior);

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

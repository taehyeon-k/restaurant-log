import { addDays, daysBetween, todayIso } from "./anniversary";
import { metersBetweenLL } from "./geo";
import { eulReul } from "./josa";
import type { Restaurant, Wish } from "./types";

/**
 * 추천 탭(HANDOFF-recommend §4) — 앱에서 셀 수 있는 것만: 최근 종류 제외 · 동네 · 위시리스트.
 * 셈에는 인증된 기록만(verified_at 있음 · 보관함 제외) 씁니다.
 */

export const verifiedOnly = (rows: Restaurant[]) => rows.filter((r) => r.verified_at && !r.pending && r.visited_at);

/** 빼지 않는 종류 — 카페·디저트(§4-5). */
const NEVER_EXCLUDE = new Set(["커피", "디저트", "베이커리", "차"]);

export type RecentMeals = {
  /** 카드에 그리는 끼니(최신 먼저, 최대 3) */
  meals: Restaurant[];
  /** 뺄 종류(칩으로 되돌리기 전) */
  excluded: string[];
  /** 「어제 중식을 드셔서 오늘은 뺐어요」 */
  sentence: string | null;
};

const byRecent = (a: Restaurant, b: Restaurant) =>
  a.visited_at! !== b.visited_at! ? (a.visited_at! < b.visited_at! ? 1 : -1) : (a.verified_at! < b.verified_at! ? 1 : -1);

/**
 * 최근 종류 제외 — 개인: 최근 3일, 연인: 최근 14일 안의 마지막 3끼.
 * 어제 먹은 종류 + 그 안에서 2번 이상 먹은 종류를 뺍니다. 카페·디저트는 빼지 않습니다.
 */
export function recentMeals(rows: Restaurant[], couple: boolean, today = todayIso()): RecentMeals {
  const from = addDays(today, couple ? -13 : -2);
  const window = verifiedOnly(rows).filter((r) => r.visited_at! >= from && r.visited_at! <= today).sort(byRecent);
  const meals = couple ? window.slice(0, 3) : window;
  const yesterday = addDays(today, -1);
  const yCats = new Set<string>();
  const count = new Map<string, number>();
  for (const r of meals) {
    if (!r.category || NEVER_EXCLUDE.has(r.category)) continue;
    count.set(r.category, (count.get(r.category) ?? 0) + 1);
    if (r.visited_at === yesterday) yCats.add(r.category);
  }
  const excluded = [...count.keys()].filter((c) => yCats.has(c) || count.get(c)! >= 2);
  let sentence: string | null = null;
  if (excluded.length === 1 && yCats.has(excluded[0])) sentence = `어제 ${eulReul(excluded[0])} 드셔서 오늘은 뺐어요`;
  else if (excluded.length) sentence = `최근 ${eulReul(excluded.join("·"))} 드셔서 뺐어요`;
  return { meals: meals.slice(0, 3), excluded, sentence };
}

/** 「어제」 「10.13」 — 최근 식사 칸의 날짜. */
export function mealDay(visitedAt: string, today = todayIso()) {
  const d = daysBetween(visitedAt, today);
  if (d === 0) return "오늘";
  if (d === 1) return "어제";
  return visitedAt.slice(5).replace("-", ".");
}

/* ───────────── 동네 ───────────── */

export type Area = { name: string; lat?: number; lng?: number; here?: boolean };

/** 주소에서 동네 이름 — 동·읍·면·가 토큰, 없으면 지역 칸의 끝(「마포구」). */
export function areaOf(address: string | null | undefined, region?: string | null): string | null {
  const tokens = (address ?? "").trim().split(/\s+/).filter(Boolean);
  const dong = tokens.slice(1).find((t) => t.length >= 2 && /[동읍면가]$/.test(t) && !/\d/.test(t));
  if (dong) return dong;
  const fallback = (region ?? "").trim().split(/\s+/).filter(Boolean).at(-1);
  return fallback && fallback.length >= 2 ? fallback : tokens.slice(1).find((t) => /[구군시]$/.test(t)) ?? null;
}

/** 이름별 수, 많은 순. */
function rank(names: (string | null)[]) {
  const map = new Map<string, number>();
  for (const n of names) if (n) map.set(n, (map.get(n) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

/** 자주 기록한 동네 — 인증 기록 수 많은 순. */
export const frequentAreas = (rows: Restaurant[]) => rank(verifiedOnly(rows).map((r) => areaOf(r.address, r.region)));
/** 위시리스트가 모인 동네. */
export const wishAreas = (wishes: Wish[]) => rank(wishes.map((w) => areaOf(w.where_text)));

/** 「지금 있는 곳」을 골랐을 때 둘레로 칠 거리. */
const NEAR_M = 1500;

export function wishInArea(w: Wish, area: Area) {
  if (area.lat != null && area.lng != null && w.lat != null && w.lng != null && metersBetweenLL(area.lat, area.lng, w.lat, w.lng) <= NEAR_M) return true;
  if (areaOf(w.where_text) === area.name) return true;
  return (w.where_text ?? "").trim().split(/\s+/).includes(area.name);
}

/* ───────────── 끼니 ───────────── */

export type Meal = "lunch" | "dinner";
/** 기본 끼니 — 15시 전이면 점심. */
export const defaultMeal = (now = new Date()): Meal => (now.getHours() < 15 ? "lunch" : "dinner");

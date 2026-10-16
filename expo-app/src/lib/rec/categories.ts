import { CATEGORIES } from "../types";
import { recCategoryOf, type RecCategory } from "../recommend";

/**
 * 카카오 category_name(「음식점 > 한식 > 해장국」) → 추천 필터 종류 · 세부 종류 · 대상 여부.
 * 「지금 뭐 먹지」는 식사 자리만 — 술집 · 간식(제과 · 아이스크림) · 카페는 뺍니다.
 * 세부 종류(sub)는 MMR 유사도에만 씁니다. 모르는 종류는 null — 맛 점수에서 중립값을 받습니다.
 */
export type CategoryInfo = {
  recCat: RecCategory | null;
  /** 기록 · 위시 어휘(CATEGORIES.restaurant) — 위시 담기 폼을 미리 채울 때. */
  base: string | null;
  sub: string | null;
  eligible: boolean;
};

const NOT_A_MEAL = /^(술집|간식|카페|제과|아이스크림|디저트)/;

const TOP: Record<string, RecCategory> = {
  한식: "한식", 중식: "중식", 일식: "일식", 양식: "양식", 분식: "분식", 아시아음식: "아시안", 패밀리레스토랑: "양식",
};

const SUB: [RecCategory, RegExp][] = [
  ["고기", /육류|고기|족발|보쌈|곱창|막창|오리|갈비|삼겹|양꼬치/],
  ["국밥·탕", /해장국|국밥|설렁탕|곰탕|감자탕|찌개|전골|삼계탕|추어|순대/],
  ["면", /냉면|국수|칼국수|막국수|라면|우동|소바|라멘/],
];

export function kakaoCategory(categoryName: string | null | undefined, name?: string | null): CategoryInfo {
  const parts = (categoryName ?? "").split(">").map((s) => s.trim()).filter(Boolean);
  const [, top, sub] = parts;
  if (parts[0] && parts[0] !== "음식점") return { recCat: null, base: null, sub: null, eligible: false };
  if (top && NOT_A_MEAL.test(top)) return { recCat: null, base: null, sub: sub ?? top, eligible: false };
  const fine = sub ? SUB.find(([, re]) => re.test(sub))?.[0] : undefined;
  const coarse = top ? TOP[top] : undefined;
  const byName = recCategoryOf(null, name);
  const recCat = fine ?? byName ?? coarse ?? null;
  const base = coarse && (CATEGORIES.restaurant as string[]).includes(coarse) ? coarse : null;
  return { recCat, base, sub: sub ?? top ?? null, eligible: true };
}

/** 기록 · 위시의 종류(한식 · 카페 계열 …) → CategoryInfo. 카페 계열은 대상이 아닙니다. */
export function recordCategory(category: string | null | undefined, name?: string | null, kind?: string): CategoryInfo {
  if (kind === "cafe" || CATEGORIES.cafe.includes(category ?? "")) return { recCat: null, base: null, sub: null, eligible: false };
  const recCat = recCategoryOf(category, name);
  const base = (CATEGORIES.restaurant as string[]).includes(category ?? "") ? category! : null;
  return { recCat, base, sub: null, eligible: true };
}

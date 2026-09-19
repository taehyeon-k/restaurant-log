import type { Restaurant } from "@/lib/types";

export const FELT_PRICE = [
  "부담없이",
  "가볍게 한 끼",
  "적당히 썼다",
  "큰맘 먹고",
  "인생에 한 번",
];

export const PRICE_STEPS = [8000, 15000, 30000, 60000];

export type PriceRow = Pick<
  Restaurant,
  "price_level" | "price_range"
>;

export const feltLevel = (r: PriceRow): number => {
  if (r.price_level) return r.price_level;

  if (r.price_range == null) return 0;

  const amount = r.price_range;

  return (
    PRICE_STEPS.filter((step) => amount > step).length + 1
  );
};

export const feltLabel = (level: number) =>
  level ? FELT_PRICE[level - 1] : "";

export const priceTitle = (r: PriceRow) => {
  const amount =
    r.price_range == null
      ? ""
      : "₩" + r.price_range.toLocaleString("ko-KR");

  return [feltLabel(feltLevel(r)), amount]
    .filter(Boolean)
    .join(" · ");
};

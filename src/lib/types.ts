export type Kind = "restaurant" | "cafe";
export type Sort = "recent" | "rating" | "price";
export type MenuItem = { name: string; price: number | null };

export type Restaurant = {
  id: number;
  created_at: string;
  kind: Kind;
  name: string;
  category: string | null;
  region: string | null;
  address: string | null;
  rating: number | null;
  menu: string | null;
  menus: MenuItem[];
  price_level: number | null;
  price_range: number | null;
  review: string | null;
  revisit: boolean;
  visited_at: string | null;
  keywords: string[];
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
};

export const CATEGORIES: Record<Kind, string[]> = {
  restaurant: ["양식", "한식", "일식", "중식", "아시안", "분식"],
  cafe: ["커피", "디저트", "베이커리", "차"],
};

export type Bbox = { s: number; n: number; w: number; e: number };

/** "37.51,126.90,37.60,127.02" → bbox. 못 읽으면 null. */
export const parseBbox = (v: string | undefined): Bbox | null => {
  const n = (v ?? "").split(",").map(Number);
  if (n.length !== 4 || n.some(Number.isNaN)) return null;
  return { s: n[0], w: n[1], n: n[2], e: n[3] };
};

export const KEYWORDS = [
  "데이트",
  "혼밥",
  "회식",
  "모임",
  "가성비",
  "분위기",
  "노포",
];

export const won = (n: number | null) =>
  n == null ? "—" : "₩" + n.toLocaleString("ko-KR");

export const shortDate = (d: string | null) =>
  d == null ? "" : d.slice(5).replace("-", ".");

/** 카테고리별 핀 색. 종이 팔레트 안에서 서로 구분되는 톤으로 골랐습니다. */
export const CATEGORY_COLORS: Record<string, string> = {
  한식: "#b4552d",
  중식: "#9a4a52",
  일식: "#5f7a8a",
  양식: "#7a6a9a",
  아시안: "#6f8455",
  분식: "#c07a2e",
  커피: "#7a5c42",
  디저트: "#b06a86",
  베이커리: "#a8853f",
  차: "#4f7a6a",
};

export const pinColor = (category: string | null) =>
  (category && CATEGORY_COLORS[category]) || "#8a8377";

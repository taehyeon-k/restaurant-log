export type Kind = "restaurant" | "cafe";
export type Sort = "recent" | "rating" | "price";

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
  restaurant: ["한식", "중식", "일식", "양식", "아시안", "분식"],
  cafe: ["커피", "디저트", "베이커리", "차"],
};

export const KEYWORDS = [
  "데이트",
  "가성비",
  "분위기",
  "혼밥",
  "작업",
  "회식",
  "노포",
  "줄서는곳",
  "기념일",
];

export const stars = (rating: number | null) => {
  const filled = Math.floor(rating ?? 0);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
};

export const won = (n: number | null) =>
  n == null ? "—" : "₩" + n.toLocaleString("ko-KR");

export const shortDate = (d: string | null) =>
  d == null ? "" : d.slice(5).replace("-", ".");

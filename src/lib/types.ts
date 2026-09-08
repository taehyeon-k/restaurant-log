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
  photo_urls: string[];
 cover_index: number;
  place_key: string | null;
  /** 그 자리에서 찍은 사진으로 인증된 기록 (모바일 카메라 흐름) */
  verified: boolean;
  /** 인증 촬영 시 위치 정확도(m). 좌표 자체는 남기지 않습니다. */
  acc: number | null;
  /** 위치 인증이 실제로 통과한 순간(UTC) — DB 트리거가 서버 시각으로 찍습니다. */
  verified_at: string | null;
  /** 사진만 찍고 본문을 아직 쓰지 않은 기록 — 보관함에만 보입니다 */
  pending: boolean;
  /** 위시에서 온 기록임을 남기는 자취. 위시가 아니었으면 null. */
  from_wish: { saved_at: string; days: number; planned: boolean } | null;
};

/** 가고싶다(위시) — 아직 가지 않은 곳. restaurants 와 달리 인증·별점·사진이 없습니다. */
export type Wish = {
  id: string;
  name: string;
  where_text: string | null;
  category: string | null;
  note: string | null;
  plan_date: string | null;
  notify: boolean;
  lat: number | null;
  lng: number | null;
  saved_at: string;
  created_at: string;
};

/** WishForm 종류 칩 — CATEGORIES(기록용)와는 다른, 위시 전용 어휘입니다. */
export const WISH_CATEGORIES = [
  "한식",
  "일식",
  "중식",
  "양식",
  "분식",
  "고기",
  "술집",
  "카페",
  "빵집",
];

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
  "가족",
  "술자리",
  "기념일",
  "가성비",
  "분위기",
  "노포",
  "동네",
  "웨이팅",
  "주차",
  "늦게까지",
];

export const won = (n: number | null) =>
  n == null ? "—" : "₩" + n.toLocaleString("ko-KR");

export const shortDate = (d: string | null) =>
  d == null ? "" : d.slice(5).replace("-", ".");

/** "2026-07-12" → "2026.07.12" */
export const dottedDate = (d: string | null) => (d ?? "").replaceAll("-", ".");

/** verified_at(UTC ISO)을 한국 시간 연·월·일·시·분으로 쪼갭니다. */
function seoulParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** UTC ISO 타임스탬프 → "13:24" (한국 시간, 24시간 HH:MM) */
export const verifiedTime = (iso: string) => {
  const p = seoulParts(iso);
  return `${p.hour}:${p.minute}`;
};

/** UTC ISO 타임스탬프 → "2026.06.28 13:24" (한국 시간, 날짜는 점 구분·시각은 24시간 HH:MM) */
export const verifiedDateTime = (iso: string) => {
  const p = seoulParts(iso);
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
};

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

const normName = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 이름이 같은 위시를 찾습니다 — 기록을 저장하는 순간의 WISH MET 전환(§7)에 씁니다. */
export const matchWish = (wishes: Wish[], name: string) =>
  wishes.find((w) => normName(w.name) === normName(name)) ?? null;

/** 그 위시가 기록이 되는 순간 남기는 자취 — restaurants.from_wish 에 그대로 들어갑니다. */
export const wishMetInfo = (wish: Wish, visitedAt: string) => {
  const savedDate = wish.saved_at.slice(0, 10);
  const days = Math.max(
    0,
    Math.round((new Date(visitedAt).getTime() - new Date(savedDate).getTime()) / 86400000)
  );
  return { saved_at: savedDate, days, planned: !!wish.plan_date };
};

/** 그 기록의 대표사진 주소. 없으면 null. */
export const coverPhoto = (r: {
  photo_urls?: string[];
  cover_index?: number;
  photo_url?: string | null;
}) => {
  const list = r.photo_urls ?? [];
  if (list.length) return list[Math.min(r.cover_index ?? 0, list.length - 1)];
  return r.photo_url ?? null;
};

import type { Restaurant } from "@/lib/types";

/**
 * 라벨첩.
 *
 * 획득 조건은 아직 확정되지 않았습니다 — 아래 규칙은 시제품의 설명글을
 * 글자 그대로 옮긴 잠정값입니다. 기준이 정해지면 need / count 만 고치면 됩니다.
 */
export type LabelShape =
  | "check"
  | "scallop"
  | "shield"
  | "hex"
  | "diamond"
  | "oct"
  | "seal";

export type LabelDef = {
  id: string;
  glyph?: string;
  shape: LabelShape;
  color: string;
  name: string;
  desc: string;
  /** 몇 개를 모아야 하는지 */
  need: number;
  /** 지금까지 모은 수 */
  count: (rows: Restaurant[]) => number;
};

const distinct = <T>(list: (T | null | undefined)[]) =>
  new Set(list.filter((v): v is T => v != null && v !== ""));

/** place_key 로 묶은 가게별 방문 수 */
const byPlace = (rows: Restaurant[]) => {
  const map = new Map<string, Restaurant[]>();
  for (const r of rows) {
    const key = r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
};

/** 기록이 있는 해가 몇 해까지 이어졌는지 */
const streak = (rows: Restaurant[]) => {
  const years = [...distinct(rows.map((r) => r.visited_at?.slice(0, 4)))]
    .map(Number)
    .sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev: number | null = null;

  for (const y of years) {
    run = prev !== null && y === prev + 1 ? run + 1 : 1;
    prev = y;
    best = Math.max(best, run);
  }
  return best;
};

export const LABELS: LabelDef[] = [
  {
    id: "verified",
    shape: "check",
    color: "#b4552d",
    name: "인증 기록자",
    desc: "인증 기록 40개",
    need: 40,
    count: (rows) => rows.filter((r) => r.verified).length,
  },
  {
    id: "gold",
    shape: "scallop",
    color: "#b58a2b",
    name: "골드 라벨",
    desc: "5.0을 준 집 열 곳",
    need: 10,
    count: (rows) =>
      distinct(rows.filter((r) => r.rating === 5).map((r) => r.name)).size,
  },
  {
    id: "regular",
    shape: "shield",
    color: "#a8412a",
    name: "레드 라벨",
    desc: "한 가게에 다섯 번",
    need: 5,
    count: (rows) =>
      Math.max(0, ...[...byPlace(rows).values()].map((v) => v.length)),
  },
  {
    id: "hundred",
    shape: "seal",
    color: "#2f3a47",
    name: "백 그릇",
    desc: "방문 100회",
    need: 100,
    count: (rows) => rows.length,
  },
  {
    id: "midnight",
    shape: "diamond",
    color: "#2f3a47",
    name: "한밤의 기록",
    desc: "자정 이후 10개",
    need: 10,
    count: (rows) =>
      rows.filter((r) => {
        const h = new Date(r.created_at).getHours();
        return h >= 0 && h < 5;
      }).length,
  },
  {
    id: "first",
    shape: "oct",
    color: "#6f7350",
    name: "첫 한 끼",
    desc: "첫 기록을 남긴 날",
    need: 1,
    count: (rows) => rows.length,
  },
  {
    id: "regions",
    shape: "hex",
    color: "#7a5c42",
    name: "열 동네",
    desc: "지역 10곳",
    need: 10,
    count: (rows) => distinct(rows.map((r) => r.region)).size,
  },
  {
    id: "years",
    shape: "shield",
    color: "#4f7a6a",
    name: "세 해의 기록",
    desc: "3년 연속",
    need: 3,
    count: streak,
  },
  { id: "revisit", shape: "seal", color: "#b4552d", name: "다시 그 집", desc: "재방문 20곳", need: 20, count: (rows) => distinct(rows.filter((r) => r.revisit).map((r) => r.place_key ?? r.name)).size },
  { id: "palate", shape: "hex", color: "#6f8455", name: "고루 먹는 입", desc: "분류 8가지", need: 8, count: (rows) => distinct(rows.map((r) => r.category)).size },
  {
    id: "weekend", shape: "diamond", color: "#7a6a9a", name: "주말의 식탁", desc: "토·일 기록 20개", need: 20,
    count: (rows) =>
      rows.filter((r) => r.visited_at && [0, 6].includes(new Date(`${r.visited_at}T00:00:00`).getDay())).length,
  },
  {
    id: "album", shape: "scallop", color: "#5f7a8a", name: "사진첩", desc: "사진 세 장 이상 10개", need: 10,
    count: (rows) =>
      rows.filter((r) => (r.photo_urls?.length ?? (r.photo_url ? 1 : 0)) >= 3).length,
  },
  {
    id: "longform", shape: "shield", color: "#7a5c42", name: "긴 이야기", desc: "100자 넘는 메모 5개", need: 5,
    count: (rows) => rows.filter((r) => (r.review ?? "").length > 100).length,
  },
  {
    id: "morning", shape: "oct", color: "#c07a2e", name: "아침의 사람", desc: "오전 기록 10개", need: 10,
    count: (rows) =>
      rows.filter((r) => r.verified && r.verified_at && new Date(r.verified_at).getHours() < 11).length,
  },
  {
    id: "thrift", shape: "seal", color: "#6f7350", name: "만원의 행복", desc: "만원 아래 20그릇", need: 20,
    count: (rows) => rows.filter((r) => r.price_range != null && r.price_range < 10000).length,
  },
  {
    id: "december", shape: "check", color: "#a8412a", name: "연말의 식탁", desc: "12월 기록 10개", need: 10,
    count: (rows) => rows.filter((r) => (r.visited_at ?? "").slice(5, 7) === "12").length,
  },
];

/** 동네 칭호 — 한 구에서 인증 기록을 쌓으면 등급이 오릅니다(등급이 오르면 아래 등급을 대체). */
export const REGION_TIERS = [
  { need: 10, tier: "동", suffix: "러버", stars: 1, color: "#8c6239", ink: "#f6ece2" },
  { need: 30, tier: "은", suffix: "보안관", stars: 2, color: "#8e949b", ink: "#f7f8f9" },
  { need: 50, tier: "금", suffix: "맛잘알", stars: 3, color: "#b58a2b", ink: "#fbf4e2" },
] as const;

export type RegionTier = (typeof REGION_TIERS)[number];

/** 서울 25개 구 로마자 표기 — 동네 칭호 배지 원반에 씁니다. */
export const REGION_EN: Record<string, string> = {
  종로구: "JONGNO", 중구: "JUNG", 용산구: "YONGSAN", 성동구: "SEONGDONG", 광진구: "GWANGJIN",
  동대문구: "DONGDAEMUN", 중랑구: "JUNGNANG", 성북구: "SEONGBUK", 강북구: "GANGBUK", 도봉구: "DOBONG",
  노원구: "NOWON", 은평구: "EUNPYEONG", 서대문구: "SEODAEMUN", 마포구: "MAPO", 양천구: "YANGCHEON",
  강서구: "GANGSEO", 구로구: "GURO", 금천구: "GEUMCHEON", 영등포구: "YEONGDEUNGPO", 동작구: "DONGJAK",
  관악구: "GWANAK", 서초구: "SEOCHO", 강남구: "GANGNAM", 송파구: "SONGPA", 강동구: "GANGDONG",
};

export type RegionTitle = {
  /** 구 이름만("중구") — 표시용. */
  region: string;
  /** 그 구에서 인증된 기록 수 */
  have: number;
  tier: RegionTier | null;
  next: RegionTier | null;
};

/**
 * 구별 동네 칭호. 인증되고 대기(pending)가 아닌 기록만 셉니다.
 * "서울 {구}" 형태만 보고 구 이름만 뽑습니다 — 그냥 구 이름만 보면 부산 중구처럼
 * 다른 시·도의 같은 이름 구와 섞입니다.
 */
export function regionTitles(rows: Restaurant[]): RegionTitle[] {
  const counts = new Map<string, number>();

  for (const r of rows) {
    if (!r.verified || r.pending) continue;
    const parts = (r.region ?? "").trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== "서울") continue;
    const gu = parts[1];
    if (!REGION_EN[gu]) continue;
    counts.set(gu, (counts.get(gu) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([region, have]) => {
      let tier: RegionTier | null = null;
      for (const t of REGION_TIERS) if (have >= t.need) tier = t;
      const next = REGION_TIERS.find((t) => have < t.need) ?? null;
      return { region, have, tier, next };
    })
    .sort((a, b) => b.have - a.have);
}

export type EarnedLabel = LabelDef & { have: number; earned: boolean };

export const earnedLabels = (rows: Restaurant[]): EarnedLabel[] =>
  LABELS.map((l) => {
    const have = l.count(rows);
    return { ...l, have, earned: have >= l.need };
  });

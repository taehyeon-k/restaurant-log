import type { Restaurant } from "@/lib/types";

/**
 * 도장 · 라벨(지시서 3 §E-1).
 *
 *  · 도장 — 인증된 기록(verified, 보관함 아님) 1건 = 도장 1개. 10칸 = 도장판 1장, 판을 채울 때마다 뽑기권 1장.
 *  · 그릇 수 라벨 — 인증 기록 수 8단계(1 · 5 · 10 · 30 · 50 · 100 · 200 · 300).
 *  · 이야기 라벨 — 원래 있던 라벨 13개(첫 한 끼 · 백 그릇은 그릇 수 단계로, 만원의 행복은 뺌) + 새 라벨 5개.
 *  · 동네 칭호(동 · 은 · 금)는 아래 REGION_TIERS 그대로.
 */
export type LabelGroup = "bowl" | "story";

export type LabelDef = {
  id: string;
  group: LabelGroup;
  /** 24×24 viewBox, 선만 그리는 SVG path */
  icon: string;
  color: string;
  name: string;
  desc: string;
  /** 몇 개를 모아야 하는지 */
  need: number;
  /** 지금까지 모은 수 */
  count: (rows: Restaurant[]) => number;
  /** 이 라벨에 들어간 기록 — 리캡의 「여기까지 왔어요」 목록. 오래된 순. */
  contrib: (rows: Restaurant[]) => Restaurant[];
};

export const STAMPS_PER_BOARD = 10;

const distinct = <T>(list: (T | null | undefined)[]) =>
  new Set(list.filter((v): v is T => v != null && v !== ""));

const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** 기록이 생긴 때 — 인증 시각, 없으면 방문일, 없으면 만든 때. */
export const recordTime = (r: Restaurant) => r.verified_at ?? (r.visited_at ? `${r.visited_at}T12:00:00` : r.created_at);
const byTime = (a: Restaurant, b: Restaurant) => (recordTime(a) < recordTime(b) ? -1 : recordTime(a) > recordTime(b) ? 1 : a.id - b.id);

/** 보관함이 아닌 기록, 오래된 순. */
const live = (rows: Restaurant[]) => rows.filter((r) => !r.pending).sort(byTime);

/** 도장이 된 기록 — 인증되고 보관함이 아닌 것, 오래된 순. n번째 도장 = [n-1]. */
export const stampRows = (rows: Restaurant[]) => live(rows).filter((r) => r.verified);

/** 도장 n번(1부터)이 찍힌 판 · 칸. 10번은 1장의 10칸. */
export const stampSlot = (n: number) => ({ board: Math.ceil(n / STAMPS_PER_BOARD), slot: ((n - 1) % STAMPS_PER_BOARD) + 1 });

/** 지금 채우는 판 — 도장 수 count 일 때 「N장째 · x / 10」과 채운 판 수. */
export const currentBoard = (count: number) => ({
  board: Math.floor(count / STAMPS_PER_BOARD) + 1,
  filled: count % STAMPS_PER_BOARD,
  done: Math.floor(count / STAMPS_PER_BOARD),
});

/** 각 칸의 기울기 — -6° · 0° · 6° 번갈아. */
export const stampTilt = (i: number) => [-6, 0, 6][i % 3];

const BOWL_ICON = "M3.5 11.5h17a8.5 8 0 0 1-17 0Z M9 8c0-1.4 1-1.6 1-3 M14 8c0-1.4 1-1.6 1-3";
/** 그릇 수 단계 — id 는 예전 「첫 한 끼(first)」 · 「백 그릇(hundred)」을 이어받아 대표 라벨이 풀리지 않게. */
export const BOWL_TIERS = [
  { need: 1, id: "first", name: "첫 기록", word: "첫" },
  { need: 5, id: "bowl5", name: "다섯 그릇", word: "다섯" },
  { need: 10, id: "bowl10", name: "열 그릇", word: "열" },
  { need: 30, id: "bowl30", name: "서른 그릇", word: "서른" },
  { need: 50, id: "bowl50", name: "쉰 그릇", word: "쉰" },
  { need: 100, id: "hundred", name: "백 그릇", word: "백" },
  { need: 200, id: "bowl200", name: "이백 그릇", word: "이백" },
  { need: 300, id: "bowl300", name: "삼백 그릇", word: "삼백" },
] as const;

const BOWLS: LabelDef[] = BOWL_TIERS.map((t) => ({
  id: t.id,
  group: "bowl",
  icon: BOWL_ICON,
  color: "#b4552d",
  name: t.name,
  desc: t.need === 1 ? "첫 인증 기록" : `인증 기록 ${t.need}건`,
  need: t.need,
  count: (rows) => stampRows(rows).length,
  contrib: (rows) => stampRows(rows).slice(0, t.need),
}));

/** 가장 많이 간 가게의 기록들. */
const topPlace = (rows: Restaurant[]) => {
  const map = new Map<string, Restaurant[]>();
  for (const r of live(rows)) {
    const k = placeKeyOf(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.values()].sort((a, b) => b.length - a.length)[0] ?? [];
};

/** 무언가(key)가 처음 나온 기록만 — 오래된 순. */
const firstOf = (rows: Restaurant[], key: (r: Restaurant) => string | null | undefined) => {
  const seen = new Set<string>();
  return live(rows).filter((r) => {
    const k = key(r);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** 기록이 있는 해가 몇 해까지 이어졌는지 — 그 연속한 해들의 첫 기록. */
const streakRows = (rows: Restaurant[]) => {
  const firsts = firstOf(rows, (r) => r.visited_at?.slice(0, 4));
  let best: Restaurant[] = [];
  let run: Restaurant[] = [];
  for (const r of firsts) {
    const y = Number(r.visited_at!.slice(0, 4));
    const prev = run.length ? Number(run[run.length - 1].visited_at!.slice(0, 4)) : null;
    run = prev !== null && y === prev + 1 ? [...run, r] : [r];
    if (run.length > best.length) best = run;
  }
  return best;
};

const goldRows = (rows: Restaurant[]) => firstOf(rows.filter((r) => r.rating === 5), (r) => r.name);
const midnightRows = (rows: Restaurant[]) => live(rows).filter((r) => new Date(r.created_at).getHours() < 5);
const weekendRows = (rows: Restaurant[]) =>
  live(rows).filter((r) => r.visited_at && [0, 6].includes(new Date(`${r.visited_at}T00:00:00`).getDay()));
const albumRows = (rows: Restaurant[]) => live(rows).filter((r) => (r.photo_urls?.length ?? (r.photo_url ? 1 : 0)) >= 3);
const longformRows = (rows: Restaurant[]) => live(rows).filter((r) => (r.review ?? "").length > 100);
const morningRows = (rows: Restaurant[]) => stampRows(rows).filter((r) => r.verified_at && new Date(r.verified_at).getHours() < 11);
const soloRows = (rows: Restaurant[]) => live(rows).filter((r) => r.keywords?.includes("혼밥"));
const wishRows = (rows: Restaurant[]) => live(rows).filter((r) => r.from_wish);

/** 한 해에 계절(분기 — 1분기 겨울 · 2분기 봄 · 3분기 여름 · 4분기 가을)을 가장 많이 채운 해의, 계절마다 첫 기록. */
const seasonRows = (rows: Restaurant[]) => {
  const byYear = new Map<string, Restaurant[]>();
  for (const r of firstOf(rows, (r) => r.visited_at && `${r.visited_at.slice(0, 4)}-${Math.ceil(Number(r.visited_at.slice(5, 7)) / 3)}`)) {
    const y = r.visited_at!.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  let best: Restaurant[] = [];
  for (const list of byYear.values()) if (list.length > best.length) best = list;
  return best;
};

/** 방문일이 든 주(월요일 시작) 번호 — 1970-01-01 이 목요일이라 3일을 더해 월요일에 끊습니다. */
const weekOf = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) / 86400000 + 3) / 7);

/** 기록이 있는 주가 몇 주까지 이어졌는지 — 그 연속한 주들의 첫 기록. */
const weekStreakRows = (rows: Restaurant[]) => {
  const firsts = firstOf(rows, (r) => r.visited_at && String(weekOf(r.visited_at))).sort((a, b) => weekOf(a.visited_at!) - weekOf(b.visited_at!));
  let best: Restaurant[] = [];
  let run: Restaurant[] = [];
  for (const r of firsts) {
    const w = weekOf(r.visited_at!);
    const prev = run.length ? weekOf(run[run.length - 1].visited_at!) : null;
    run = prev !== null && w === prev + 1 ? [...run, r] : [r];
    if (run.length > best.length) best = run;
  }
  return best;
};
const decemberRows = (rows: Restaurant[]) => live(rows).filter((r) => (r.visited_at ?? "").slice(5, 7) === "12");

/** 그 목록의 길이를 세고, 앞에서 need 개를 리캡 목록으로. */
const story = (d: Omit<LabelDef, "group" | "count" | "contrib">, list: (rows: Restaurant[]) => Restaurant[]): LabelDef => ({
  ...d,
  group: "story",
  count: (rows) => list(rows).length,
  contrib: (rows) => list(rows).slice(0, d.need),
});

/** 이야기 라벨 — 그릇 수 라벨이 생기기 전부터 있던 라벨(첫 한 끼 · 백 그릇은 그릇 수로 옮겨 감). */
const STORIES: LabelDef[] = [
  story({ id: "verified", icon: "M6.5 12.5l3.5 3.5 7.5-8", color: "#b4552d", name: "프로기록러", desc: "인증 기록 40개", need: 40 }, stampRows),
  story({ id: "gold", icon: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8Z", color: "#b58a2b", name: "오점 없는 사람", desc: "5.0을 준 집 열 곳", need: 10 }, goldRows),
  story({ id: "regular", icon: "M12 19.5s-7-4.3-7-9.6a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4c0 5.3-7 9.6-7 9.6Z", color: "#a8412a", name: "삼고초려", desc: "한 가게에 세 번", need: 3 }, topPlace),
  story({ id: "midnight", icon: "M18.5 14.5A7 7 0 1 1 9.5 5.5a5.6 5.6 0 0 0 9 9Z", color: "#3d4a6b", name: "한밤의 기록", desc: "자정 이후 10개", need: 10 }, midnightRows),
  story({ id: "regions", icon: "M12 20.5s-6-6-6-10.8a6 6 0 0 1 12 0c0 4.8-6 10.8-6 10.8Z M12 7.7a2 2 0 1 0 .01 0", color: "#7a5c42", name: "열 동네", desc: "지역 10곳", need: 10 }, (rows) => firstOf(rows, (r) => r.region)),
  story({ id: "years", icon: "M5 6.5h14v13H5Z M5 10.5h14 M9 4.5v4 M15 4.5v4", color: "#4f7a6a", name: "세 해의 기록", desc: "3년 연속", need: 3 }, streakRows),
  story({ id: "revisit", icon: "M18.5 12a6.5 6.5 0 1 1-1.9-4.6 M18.5 4.5v3.5H15", color: "#b4552d", name: "다시 그 집", desc: "재방문 20곳", need: 20 }, (rows) => firstOf(rows.filter((r) => r.revisit), placeKeyOf)),
  story({ id: "palate", icon: "M7.5 4v5.5a2 2 0 0 0 4 0V4 M9.5 4v16 M16.5 20V4c1.8 1 2.8 3.6 2.8 7.5h-2.8", color: "#6f8455", name: "고루 먹는 입", desc: "분류 8가지", need: 8 }, (rows) => firstOf(rows, (r) => r.category)),
  story({ id: "weekend", icon: "M8 4h8c0 4.8-1.6 7.5-4 7.5S8 8.8 8 4Z M12 11.5v8 M8.5 19.5h7", color: "#7a6a9a", name: "주말의 식탁", desc: "토·일 기록 20개", need: 20 }, weekendRows),
  story({ id: "album", icon: "M4.5 6h15v12.5h-15Z M4.5 15.5l4.5-4.5 4 4 2-2 4.5 4.5 M15 8.6a1.3 1.3 0 1 0 .01 0", color: "#5f7a8a", name: "포토그래퍼", desc: "사진 세 장 이상 10개", need: 10 }, albumRows),
  story({ id: "longform", icon: "M5.5 18.5l1-3.8 9.6-9.6 2.8 2.8-9.6 9.6Z M14 7.2l2.8 2.8", color: "#7a5c42", name: "투머치토커", desc: "100자 넘는 메모 5개", need: 5 }, longformRows),
  story({ id: "morning", icon: "M12 8a4 4 0 1 0 .01 0 M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.7 5.7l1.4 1.4 M16.9 16.9l1.4 1.4 M5.7 18.3l1.4-1.4 M16.9 7.1l1.4-1.4", color: "#c07a2e", name: "아침의 사람", desc: "오전 기록 10개", need: 10 }, morningRows),
  story({ id: "planner", icon: "M7 4.5h10v15l-5-3.6-5 3.6Z M9.3 10.2l1.9 1.9 3.6-3.8", color: "#5f6b8a", name: "확신의 J", desc: "위시에서 온 기록 10개", need: 10 }, wishRows),
  story({ id: "seasons", icon: "M12 4a8 8 0 1 0 .01 0 M12 4v16 M4 12h16", color: "#8f5a26", name: "사계절 식탁", desc: "한 해에 사계절 모두", need: 4 }, seasonRows),
  story({ id: "solo", icon: "M12 5a3 3 0 1 0 .01 0 M6.5 19.5a5.5 5.5 0 0 1 11 0", color: "#4a6670", name: "혼자의 식탁", desc: "혼밥 기록 10개", need: 10 }, soloRows),
  story({ id: "weeks", icon: "M5 6.5h14v13H5Z M5 10.5h14 M9 4.5v4 M15 4.5v4 M8 15h1.5 M11.25 15h1.5 M14.5 15h1.5", color: "#9a4a52", name: "한 달의 식탁", desc: "4주 연속 매주 기록", need: 4 }, weekStreakRows),
  story({ id: "explorer", icon: "M12 4a8 8 0 1 0 .01 0 M14.8 9.2l-1.6 4-4 1.6 1.6-4Z", color: "#3d6b7a", name: "맛집 콜럼버스", desc: "서로 다른 가게 50곳", need: 50 }, (rows) => firstOf(rows, placeKeyOf)),
  story({ id: "december", icon: "M12 3.5v17 M4.6 7.75l14.8 8.5 M4.6 16.25l14.8-8.5", color: "#a8412a", name: "연말의 식탁", desc: "12월 기록 10개", need: 10 }, decemberRows),
];

export const LABELS: LabelDef[] = [...BOWLS, ...STORIES];
export const labelById = (id: string | null | undefined) => (id ? LABELS.find((l) => l.id === id) ?? null : null);

/** 다음 그릇 수 단계 — 「서른 그릇까지 20」. 다 받았으면 null. */
export function nextBowl(stamps: number) {
  const i = BOWL_TIERS.findIndex((t) => stamps < t.need);
  if (i < 0) return null;
  const prev = i > 0 ? BOWL_TIERS[i - 1].need : 0;
  return { tier: BOWL_TIERS[i], left: BOWL_TIERS[i].need - stamps, from: prev };
}

/**
 * 라벨을 받은 기록(그 기록이 생기며 조건을 채웠음). 못 받았으면 null.
 * 오래된 순으로 하나씩 더해 보며 처음 조건을 채운 기록을 찾습니다.
 */
export function earnedBy(def: LabelDef, rows: Restaurant[]): Restaurant | null {
  const list = live(rows);
  if (def.count(list) < def.need) return null;
  if (def.group === "bowl") return stampRows(list)[def.need - 1] ?? null;
  for (let i = 0; i < list.length; i++) {
    if (def.count(list.slice(0, i + 1)) >= def.need) return list[i];
  }
  return null;
}

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

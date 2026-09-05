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
];

export type EarnedLabel = LabelDef & { have: number; earned: boolean };

export const earnedLabels = (rows: Restaurant[]): EarnedLabel[] =>
  LABELS.map((l) => {
    const have = l.count(rows);
    return { ...l, have, earned: have >= l.need };
  });

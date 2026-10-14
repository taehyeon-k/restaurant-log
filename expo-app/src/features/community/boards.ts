import { ALL_CATEGORIES } from "@/lib/types";
import type { BoardId, Period, Scope } from "./api";

/** 랭킹 종류(핸드오프 §7 표) — 이름 · 세는 법 한 줄 · 단위 · 상세 eyebrow. 모두 인증된 방문만, 같은 가게는 하루 한 번. */
export type BoardMeta = { id: BoardId; name: string; rule: string; unit: string; en: string; perPeriod: boolean };

export const BOARDS: BoardMeta[] = [
  { id: "verified", name: "인증왕", rule: "인증한 방문 수", unit: "번", en: "VERIFIED", perPeriod: true },
  { id: "explorer", name: "탐험가", rule: "처음 가 본 가게 수", unit: "곳", en: "EXPLORER", perPeriod: true },
  { id: "regular", name: "단골", rule: "한 가게에 다시 간 횟수", unit: "번", en: "REGULAR", perPeriod: true },
  { id: "district", name: "동네 넓히기", rule: "인증한 구(區) 수", unit: "구", en: "DISTRICTS", perPeriod: true },
  { id: "streak", name: "꾸준함", rule: "기록을 남긴 주 연속", unit: "주", en: "STREAK", perPeriod: false },
];

/** 종류별 — 기록의 종류(CATEGORIES)마다 따로. */
export const CATEGORY_BOARDS: BoardMeta[] = ALL_CATEGORIES.map((c) => ({
  id: `category:${c}` as BoardId, name: c, rule: `${c} 인증 방문 수`, unit: "번", en: "CATEGORY", perPeriod: true,
}));

export const boardMeta = (id: string) => [...BOARDS, ...CATEGORY_BOARDS].find((b) => b.id === id) ?? BOARDS[0];

export const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "이번 주" },
  { id: "month", label: "이번 달" },
  { id: "quarter", label: "이번 분기" },
];
export const SCOPES: { id: Scope; label: string }[] = [
  { id: "friends", label: "친구" },
  { id: "all", label: "전체" },
];
export const periodLabel = (p: Period) => PERIODS.find((x) => x.id === p)!.label;

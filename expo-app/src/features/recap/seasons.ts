/**
 * 분기 리캡 — 분기 계산과 계절별 색·문구(HANDOFF quarterly recap §1 Season palette).
 * 날짜는 모두 한국 시간(Asia/Seoul, UTC+9, 서머타임 없음)으로 자릅니다. Hermes 기본 빌드의
 * Intl timeZone 에 기대지 않으려고 시차를 직접 더합니다.
 */

export type Q = 1 | 2 | 3 | 4;
/** "2026-Q3" */
export type QuarterId = string;

export type Season = {
  name: string;
  /** JUL — SEP · 3분기 */
  months: string;
  /** 7월 1일부터 9월 30일까지 */
  range: string;
  prev: string;
  next: string;
  /** OCT — DEC (다음 분기) */
  nextMonths: string;
  accent: string;
  deep: string;
  tint: string;
  tintLine: string;
  tintInk: string;
  alt: string;
  alt2: string;
};

export const SEASONS: Record<Q, Season> = {
  1: { name: "겨울", months: "JAN — MAR · 1분기", range: "1월 1일부터 3월 31일까지", prev: "가을", next: "봄", nextMonths: "APR — JUN", accent: "#5f7a8a", deep: "#1f2a30", tint: "#e6ebec", tintLine: "#c3ced3", tintInk: "#3f5866", alt: "#7a6a9a", alt2: "#9a4a52" },
  2: { name: "봄", months: "APR — JUN · 2분기", range: "4월 1일부터 6월 30일까지", prev: "겨울", next: "여름", nextMonths: "JUL — SEP", accent: "#9a4a52", deep: "#2a1c1e", tint: "#f5e8e8", tintLine: "#e2c4c7", tintInk: "#7f3a42", alt: "#5f7a8a", alt2: "#7a5c42" },
  3: { name: "여름", months: "JUL — SEP · 3분기", range: "7월 1일부터 9월 30일까지", prev: "봄", next: "가을", nextMonths: "OCT — DEC", accent: "#b4552d", deep: "#1c1a17", tint: "#f7ece5", tintLine: "#e0c3b1", tintInk: "#a34d27", alt: "#5f7a8a", alt2: "#9a4a52" },
  4: { name: "가을", months: "OCT — DEC · 4분기", range: "10월 1일부터 12월 31일까지", prev: "여름", next: "겨울", nextMonths: "JAN — MAR", accent: "#8f5a26", deep: "#241b14", tint: "#f4ebdf", tintLine: "#dcc6a8", tintInk: "#7a4c1f", alt: "#5f7a8a", alt2: "#9a4a52" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const SEOUL_MS = 9 * 3600 * 1000;

/** 한국 시간으로 쪼갠 시각. */
export function seoulParts(at: Date | string) {
  const d = new Date(new Date(at).getTime() + SEOUL_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    /** 0 = 일요일 */
    weekday: d.getUTCDay(),
  };
}

/** 오늘(한국 시간) "YYYY-MM-DD" */
export function seoulToday(now = new Date()) {
  const p = seoulParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseQuarter(id: QuarterId): { year: number; q: Q } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(id);
  return m ? { year: Number(m[1]), q: Number(m[2]) as Q } : null;
}

export const quarterId = (year: number, q: Q): QuarterId => `${year}-Q${q}`;

/** "2026-08-14" → "2026-Q3" */
export function quarterOfDate(dateKey: string): QuarterId {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return quarterId(year, (Math.floor((month - 1) / 3) + 1) as Q);
}

export const currentQuarter = (now = new Date()) => quarterOfDate(seoulToday(now));

export function shiftQuarter(id: QuarterId, delta: number): QuarterId {
  const p = parseQuarter(id)!;
  const n = p.year * 4 + (p.q - 1) + delta;
  return quarterId(Math.floor(n / 4), ((n % 4) + 1) as Q);
}

/** 분기 첫날·마지막 날 "YYYY-MM-DD" (양 끝 포함) */
export function quarterRange(id: QuarterId) {
  const { year, q } = parseQuarter(id)!;
  const m1 = (q - 1) * 3 + 1;
  const m3 = m1 + 2;
  const lastDay = new Date(Date.UTC(year, m3, 0)).getUTCDate();
  return { start: `${year}-${pad(m1)}-01`, end: `${year}-${pad(m3)}-${pad(lastDay)}`, firstMonth: m1, lastMonth: m3 };
}

export const seasonOf = (id: QuarterId) => SEASONS[parseQuarter(id)!.q];

/** "2026 Q3" */
export const quarterLabel = (id: QuarterId) => id.replace("-", " ");

/* ── 한국어 ─────────────────────────────────────── */

/** 마지막 글자에 받침이 있는지 */
export function hasBatchim(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 을/를 */
export const eulReul = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;
/** 이었어요/였어요 */
export const ieosseoyo = (word: string) => `${word}${hasBatchim(word) ? "이었어요" : "였어요"}`;
/** 은/는 */
export const eunNeun = (word: string) => `${word}${hasBatchim(word) ? "은" : "는"}`;
/** 과/와 */
export const gwaWa = (word: string) => `${word}${hasBatchim(word) ? "과" : "와"}`;

const ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
const TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];

/** 수 관형사("열한 끼", "네 곳") — 1~99 만 고유어로, 그 밖은 숫자 그대로. */
export function nativeCount(n: number) {
  if (n < 1 || n > 99 || !Number.isInteger(n)) return String(n);
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (t === 2 && o === 0) return "스무";
  return `${TENS[t]}${ONES[o]}`;
}

/** "2026-08-14" → "08.14" */
export const mmdd = (dateKey: string) => `${dateKey.slice(5, 7)}.${dateKey.slice(8, 10)}`;
/** "2026-08-14" → "8.14" */
export const mdd = (dateKey: string) => `${Number(dateKey.slice(5, 7))}.${dateKey.slice(8, 10)}`;

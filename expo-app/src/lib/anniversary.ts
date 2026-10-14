import type { Restaurant } from "./types";

/**
 * 연인 기록의 기념일 계산(HANDOFF-couple.md §2). 날짜는 모두 "YYYY-MM-DD" 문자열 — 시간대를 타지 않게
 * UTC 자정으로만 셈합니다.
 *  · D+N = 오늘 − 사귄 날 + 1 (첫날 = 1일)
 *  · 100일 단위: 사귄 날 + (100k − 1)일
 *  · 주년: 같은 월·일, 매년. 2월 29일에 시작했으면 평년엔 2월 28일.
 */

export type Milestone = {
  /** anniversary_picks.milestone — '100d','200d',…,'1y','2y' */
  key: string;
  /** 「100일」 「1주년」 */
  label: string;
  date: string;
};

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");
const toUtc = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** 기기 시계로 본 오늘(현지 날짜). */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY);

/** 사귄 날을 1일로 센 그날의 날수. 사귀기 전이면 0 이하. */
export const dayCount = (startedOn: string, on = todayIso()) => daysBetween(startedOn, on) + 1;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** n주년 날짜 — 2월 29일 시작이면 평년엔 2월 28일. */
export function yearAnniversary(startedOn: string, n: number) {
  const [y, m, d] = startedOn.split("-").map(Number);
  const year = y + n;
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

export const hundredDay = (startedOn: string, k: number) => addDays(startedOn, 100 * k - 1);

/** startedOn 부터 until(포함)까지의 모든 기념일, 날짜 오름차순. */
export function milestonesUntil(startedOn: string, until: string): Milestone[] {
  const out: Milestone[] = [];
  for (let k = 1; ; k++) {
    const date = hundredDay(startedOn, k);
    if (date > until) break;
    out.push({ key: `${k * 100}d`, label: `${k * 100}일`, date });
  }
  for (let n = 1; ; n++) {
    const date = yearAnniversary(startedOn, n);
    if (date > until) break;
    out.push({ key: `${n}y`, label: `${n}주년`, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key.endsWith("y") ? 1 : -1));
}

/** 오늘 이후(오늘 포함) 가장 가까운 기념일. */
export function nextMilestone(startedOn: string, today = todayIso()): Milestone {
  // 100일 단위가 늦어도 100일 안에 하나는 오니 넉넉히 1년 앞까지만 봅니다.
  return milestonesUntil(startedOn, addDays(today, 400)).find((m) => m.date >= today)!;
}

/** 기념일 탭 목록 — 지난 것 + 다음 1개, 날짜 내림차순. */
export function anniversaryList(startedOn: string, today = todayIso()): Milestone[] {
  const next = nextMilestone(startedOn, today);
  return milestonesUntil(startedOn, next.date).reverse();
}

/** 그날의 기념일(있으면). 같은 날 둘이면 주년을 앞에. */
export function milestoneOn(startedOn: string, date: string): Milestone | null {
  if (date < startedOn) return null;
  const hit = milestonesUntil(startedOn, date).filter((m) => m.date === date);
  return hit.find((m) => m.key.endsWith("y")) ?? hit[0] ?? null;
}

export type AnniversaryPick = { milestone: string; record_id: number | null; cleared: boolean };

export type Meal =
  | { kind: "picked"; record: Restaurant }
  | { kind: "day"; record: Restaurant }
  | { kind: "cleared" }
  | { kind: "none" };

/**
 * 기념일 식사 — 비워둠 → 직접 고른 기록 → 그날 기록 중 가장 이른 것 → 빈칸.
 * rows 는 같은 기록장의 보이는 기록(보관함 제외)이어야 합니다.
 */
export function mealFor(m: Milestone, picks: AnniversaryPick[], rows: Restaurant[]): Meal {
  const pick = picks.find((p) => p.milestone === m.key);
  if (pick?.cleared) return { kind: "cleared" };
  if (pick?.record_id != null) {
    const r = rows.find((x) => x.id === pick.record_id);
    if (r) return { kind: "picked", record: r };
  }
  const sameDay = rows
    .filter((r) => r.visited_at === m.date)
    .sort((a, b) => ((a.verified_at ?? a.created_at) < (b.verified_at ?? b.created_at) ? -1 : 1));
  return sameDay[0] ? { kind: "day", record: sameDay[0] } : { kind: "none" };
}

/** 기념일 식사로 정해진 기록 id → 기념일 라벨(「1주년」). 지도 카드·말풍선이 씁니다. */
export function mealLabels(startedOn: string, picks: AnniversaryPick[], rows: Restaurant[], today = todayIso()) {
  const out = new Map<number, string>();
  for (const m of milestonesUntil(startedOn, today)) {
    const meal = mealFor(m, picks, rows);
    if (meal.kind === "picked" || meal.kind === "day") {
      if (!out.has(meal.record.id)) out.set(meal.record.id, m.label);
    }
  }
  return out;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export const weekdayOf = (d: string) => WEEK[new Date(toUtc(d)).getUTCDay()];
/** "2026-08-29" → "2026.08.29 (토)" */
export const dottedWithDay = (d: string) => `${d.replaceAll("-", ".")} (${weekdayOf(d)})`;

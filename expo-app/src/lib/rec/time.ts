/** 한국 시간 기준 요일 · 분 · 날짜. 추천은 한국 식사 시간으로 셉니다(기기 시간대와 무관). */
export function seoulClock(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, dow, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type MealSlot = "lunch" | "dinner" | "other";

/** 점심 10:30–15:00, 저녁 17:00–21:30, 나머지는 그 밖. */
export function mealSlotOf(minutes: number): MealSlot {
  if (minutes >= 630 && minutes < 900) return "lunch";
  if (minutes >= 1020 && minutes < 1290) return "dinner";
  return "other";
}

export const SLOT_LABEL: Record<MealSlot, string> = { lunch: "점심", dinner: "저녁", other: "이 시간" };

export const isWeekend = (dow: number) => dow === 0 || dow === 6;

/** ISO 날짜 사이 날 수(b − a). */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

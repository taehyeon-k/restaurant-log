import { dayCount, mealFor, milestonesUntil, todayIso, type AnniversaryPick } from "@/lib/anniversary";
import { BOWL_TIERS } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";

/**
 * 연인 라벨(HANDOFF-couple-account §3) — 연인 기록장 기록으로만 셉니다. 개인 라벨(labels.ts)과 섞지 않고,
 * 저장하지 않고 매번 계산합니다. 대표 라벨 지정은 없습니다.
 */
export type CoupleContext = {
  /** 연인 기록장의 보이는 기록(보관함 제외) */
  rows: Restaurant[];
  startedOn: string;
  picks: AnniversaryPick[];
  /** 두 사람 모두 한 줄을 남긴 기록 수 */
  sharedNotes: number;
  /** 둘 다 한 줄을 쓴 인증 기록 수 — 연인 그릇 수 라벨 */
  bothWrote: number;
  meId: string;
  partnerId: string | null;
  today?: string;
};

export type CoupleLabelDef = {
  id: string;
  color: string;
  name: string;
  desc: string;
  need: number;
  count: (ctx: CoupleContext) => number;
};

const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** 가게별 방문 수 */
export const visitsByPlace = (rows: Restaurant[]) => {
  const map = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const key = placeKeyOf(r);
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { name: r.name, count: 1 });
  }
  return map;
};

/** 기념일 식사가 채워진(직접 고름 · 그날 기록) 지난 기념일 수 */
export const filledAnniversaries = (startedOn: string, picks: AnniversaryPick[], rows: Restaurant[], today = todayIso()) =>
  milestonesUntil(startedOn, today).filter((m) => {
    const meal = mealFor(m, picks, rows);
    return meal.kind === "picked" || meal.kind === "day";
  }).length;

const verifiedBy = (rows: Restaurant[], userId: string | null) =>
  userId ? rows.filter((r) => r.verified && r.user_id === userId).length : 0;

export const COUPLE_LABELS: CoupleLabelDef[] = [
  {
    id: "first_meal", color: "#6f7350", name: "첫 식사", desc: "사귄 날의 기록", need: 1,
    count: ({ rows, startedOn }) => Math.min(1, rows.filter((r) => r.visited_at === startedOn).length),
  },
  {
    id: "anniv_table", color: "#b4552d", name: "기념일 식탁", desc: "기념일 식사를 채운 기념일 3번", need: 3,
    count: ({ rows, startedOn, picks, today }) => filledAnniversaries(startedOn, picks, rows, today),
  },
  {
    id: "shared_note", color: "#7a5c42", name: "함께 남긴 한 줄", desc: "함께 남긴 기록 20개", need: 20,
    count: ({ sharedNotes }) => sharedNotes,
  },
  {
    id: "regular", color: "#a8412a", name: "우리 단골", desc: "같은 가게 5번", need: 5,
    count: ({ rows }) => Math.max(0, ...[...visitsByPlace(rows).values()].map((v) => v.count)),
  },
  {
    id: "take_turns", color: "#4f6b7a", name: "번갈아 찍기", desc: "두 사람 각각 인증 10번", need: 10,
    count: ({ rows, meId, partnerId }) => Math.min(verifiedBy(rows, meId), verifiedBy(rows, partnerId)),
  },
  {
    // 1~30일 · 31~60일 · 61~90일 · 91~100일, 네 구간 모두에 기록이 하나 이상.
    id: "hundred_days", color: "#4f7a6a", name: "100일의 기록", desc: "사귄 날부터 100일 동안 매 30일마다 기록", need: 4,
    count: ({ rows, startedOn }) => {
      const hit = new Set<number>();
      for (const r of rows) {
        if (!r.visited_at) continue;
        const n = dayCount(startedOn, r.visited_at);
        if (n >= 1 && n <= 100) hit.add(Math.floor((n - 1) / 30));
      }
      return hit.size;
    },
  },
];

/** 함께 그릇 수 — 개인 그릇 수 8단계와 같은 단계, 둘 다 한 줄을 쓴 인증 기록만. */
COUPLE_LABELS.push(...BOWL_TIERS.map((t) => ({
  id: `together_${t.id}`, color: "#b4552d", name: `함께 ${t.name}`, desc: `둘 다 한 줄을 쓴 인증 기록 ${t.need}건`, need: t.need,
  count: ({ bothWrote }: CoupleContext) => bothWrote,
})));

export type EarnedCoupleLabel = CoupleLabelDef & { have: number; earned: boolean };

export const earnedCoupleLabels = (ctx: CoupleContext): EarnedCoupleLabel[] =>
  COUPLE_LABELS.map((l) => {
    const have = Math.min(l.count(ctx), l.need);
    return { ...l, have, earned: have >= l.need };
  });

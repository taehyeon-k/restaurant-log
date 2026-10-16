import { addDays, daysBetween, todayIso } from "./anniversary";
import { metersBetweenLL, norm } from "./geo";
import { eulReul, euroRo } from "./josa";
import { wishKind, type Restaurant, type Wish } from "./types";

/**
 * 추천 탭 v2(HANDOFF-recommend-all §4–6 · HANDOFF-recommend-fix-distance-hours) — 「지금 뭐 먹지 / 둘러보기」의 순수 계산.
 * 화면의 숫자는 좌표 계산(직선거리) 또는 인증 기록에서만 나옵니다.
 * 남의 기록은 서버 함수(rec_places · rec_courses · …)가 숫자로만 돌려주고, 여기서는 그 숫자와 내 기록 · 위시로 고르고 까닭을 씁니다.
 * 셈에는 인증된 기록만(verified_at 있음 · 보관함 제외) 씁니다.
 */

export const verifiedOnly = (rows: Restaurant[]) => rows.filter((r) => r.verified_at && !r.pending && r.visited_at);

/* ───────────── 이름 · 종류 · 거리 ───────────── */

/** 두 모드 이름 — 아직 확정 전이라(§4-1-1) 여기 한 곳에만 둡니다. */
export const REC_MODE_LABEL = { now: "지금 뭐 먹지", browse: "둘러보기" } as const;
export type RecMode = keyof typeof REC_MODE_LABEL;

/** 필터 종류 9개(§5-2). 먹고 싶은 것 · 빼고 싶은 것이 함께 씁니다. */
export const REC_CATEGORIES = ["한식", "중식", "일식", "양식", "고기", "국밥·탕", "면", "분식", "아시안"] as const;
export type RecCategory = (typeof REC_CATEGORIES)[number];

/**
 * 기록 · 검색 종류는 한식 · 중식 · 일식 · 양식 · 아시안 · 분식 여섯뿐이라
 * 고기 · 국밥·탕 · 면은 가게 이름으로 가려냅니다(「○○갈비」 → 고기). 맞는 게 없으면 기록 종류 그대로.
 */
const BY_NAME: [RecCategory, RegExp][] = [
  ["고기", /고기|갈비|삼겹|목살|곱창|막창|대창|한우|숯불|정육|족발|보쌈|오리|양꼬치|돈까스?$/],
  ["국밥·탕", /국밥|해장|설렁탕|곰탕|감자탕|순대국|갈비탕|추어|삼계탕|부대찌개|찌개/],
  ["면", /국수|냉면|칼국수|라멘|라면|우동|소바|짬뽕|쌀국수|파스타|면옥|면가|막국수/],
];
export function recCategoryOf(category: string | null | undefined, name?: string | null): RecCategory | null {
  const hit = name ? BY_NAME.find(([, re]) => re.test(name)) : undefined;
  if (hit) return hit[0];
  return (REC_CATEGORIES as readonly string[]).includes(category ?? "") ? (category as RecCategory) : null;
}

/**
 * 거리 — 직선거리(m)만 씁니다(HANDOFF-recommend-fix-distance-hours). 도보 시간은 실제 길과 달라 쓰지 않습니다.
 * 거리 필터는 없애고 이 반경 안에서 가까울수록 점수를 더 줍니다.
 */
export const NEAR_MAX_M = 2000;
/** 가까움 점수 — 0m 에서 60, NEAR_MAX_M 에서 0. 재방문율(최대 100)과 함께 「가까운 곳 위주」가 되도록 큰 편입니다. */
const NEAR_WEIGHT = 60;

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const pctOf = (rate: number | string | null | undefined) => Math.round(Number(rate ?? 0) * 100);

const DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/* ───────────── 필터 (§5-2) ───────────── */

export type RecFilter = { inc: RecCategory[]; exc: RecCategory[] };

/**
 * 기본 「빼고 싶은 것」 — 최근 3일 인증 기록에서 어제 먹은 종류 + 3일 안 2번 이상 먹은 종류.
 * 카페 · 디저트는 필터 종류에 없으니 저절로 빠지지 않습니다. 연인 기록장은 두 사람 기록이 함께 들어 있어 합산됩니다.
 */
export function recentExclude(rows: Restaurant[], today = todayIso()) {
  const from = addDays(today, -2);
  const yesterday = addDays(today, -1);
  const count = new Map<RecCategory, number>();
  const yCats = new Set<RecCategory>();
  for (const r of verifiedOnly(rows)) {
    if (r.visited_at! < from || r.visited_at! > today || r.kind !== "restaurant") continue;
    const c = recCategoryOf(r.category, r.name);
    if (!c) continue;
    count.set(c, (count.get(c) ?? 0) + 1);
    if (r.visited_at === yesterday) yCats.add(c);
  }
  const exc = REC_CATEGORIES.filter((c) => yCats.has(c) || (count.get(c) ?? 0) >= 2);
  return { exc, yesterday: REC_CATEGORIES.filter((c) => yCats.has(c)) };
}

export const defaultFilter = (rows: Restaurant[], today = todayIso()): RecFilter => ({
  inc: [], exc: recentExclude(rows, today).exc,
});

/* ───────────── 「지금 뭐 먹지」 5곳 (§5-5) ───────────── */

/** rec_places 한 줄. slot_dow — 최근 4주 같은 요일 지금 ±1시간 인증 수, slot_any — 요일 상관없이. */
export type PlaceStat = {
  place: string; name: string; category: string | null; kind: string; address: string | null;
  lat: number; lng: number; distance_m: number; place_url: string | null; users: number; revisit_rate: number | string;
  today_count: number; last_at: string | null; week_count: number; steady_years: number; mine: number;
  slot_dow: number; slot_any: number;
};

export type Pick = {
  key: string; name: string; recCat: RecCategory | null; category: string | null;
  lat: number; lng: number; distance: number; placeUrl: string | null;
  stat: PlaceStat; wish: Wish | null; reasons: string[]; score: number;
};

/** 내 기록장에서 이 가게를 인증한 적이 있는지 — 서버 mine 은 개인 · 연인 기록장을 가리지 않습니다. */
const visitedIn = (rows: Restaurant[], name: string, lat: number, lng: number) =>
  verifiedOnly(rows).some((r) => norm(r.name) === norm(name) && r.lat != null && r.lng != null && metersBetweenLL(r.lat, r.lng, lat, lng) <= 100);

/**
 * 「지금 뭐 먹지」 5곳(§5-5, 수정 §2-5).
 *   1. 2km 안 + 최근 4주 같은 요일 지금 ±1시간에 인증 1건 이상 — 5곳이 안 차면 요일 조건을 빼고 다시, 그래도 모자라면 있는 만큼.
 *   2. 먹고 싶은 것이 있으면 그 종류만, 빼고 싶은 것은 뺌.
 *   3. 점수 = 가까움 + 재방문율 + 오늘 인증 수 가중 + 시간대 인증 + 위시리스트 보너스 + 아직 안 간 곳 보너스.
 * 까닭 문장은 기여가 큰 순으로 3개 — 인증 기록 · 위시 · 걸러낸 종류에서만 씁니다(영업시간 · 도보 시간 없음).
 */
export function pickNow(opts: {
  stats: PlaceStat[]; wishes: Wish[]; rows: Restaurant[]; filter: RecFilter; yesterday: RecCategory[]; couple: boolean;
  today?: string; now?: Date;
}): { picks: Pick[]; anyDay: boolean } {
  const { stats, wishes, rows, filter, yesterday, couple, today = todayIso(), now = new Date() } = opts;
  const allowed = (c: RecCategory | null) => (filter.inc.length ? !!c && filter.inc.includes(c) : !c || !filter.exc.includes(c));
  const base = stats.filter((s) => s.kind === "restaurant" && s.distance_m <= NEAR_MAX_M && allowed(recCategoryOf(s.category, s.name)));
  const byDow = base.filter((s) => s.slot_dow > 0);
  const anyDay = byDow.length < 5;
  const pool = anyDay ? base.filter((s) => s.slot_any > 0) : byDow;
  const swapped = yesterday.filter((c) => filter.exc.includes(c));
  const dayName = DAY_NAMES[now.getDay()];

  const picks = pool
    .map((s): Pick => {
      const recCat = recCategoryOf(s.category, s.name);
      const wish = wishes.find((w) => wishKind(w) !== "cafe" && norm(w.name) === norm(s.name) && (w.lat == null || w.lng == null || metersBetweenLL(s.lat, s.lng, w.lat, w.lng) <= 100)) ?? null;
      const fresh = s.mine === 0 && !visitedIn(rows, s.name, s.lat, s.lng);
      const slot = anyDay ? s.slot_any : s.slot_dow;
      const parts: { v: number; text?: string }[] = [
        { v: Math.round(NEAR_WEIGHT * Math.max(0, 1 - s.distance_m / NEAR_MAX_M)) }, // 점수만 — 거리는 보조줄에 있습니다.
      ];
      if (pctOf(s.revisit_rate) > 0) parts.push({ v: pctOf(s.revisit_rate), text: `인증한 사람의 ${pctOf(s.revisit_rate)}%가 다시 갔어요` });
      if (s.today_count > 0) parts.push({ v: Math.min(s.today_count, 10) * 4, text: `오늘 인증 ${s.today_count}건${s.last_at ? ` · 마지막 ${hhmmOf(s.last_at)}` : ""}` });
      parts.push({ v: Math.min(slot, 10) * 3, text: anyDay ? `지난 4주 이 시간대에 인증 ${slot}건` : `지난 4주 ${dayName} 이 시간대에 인증 ${slot}건` });
      if (wish) {
        const days = Math.max(0, daysBetween(wish.saved_at.slice(0, 10), today));
        parts.push({ v: 30, text: `${couple ? "우리 " : ""}위시리스트에 담은 지 ${days}일 된 곳이에요` });
      }
      if (swapped.length && recCat && !swapped.includes(recCat)) parts.push({ v: 10, text: `어제 ${eulReul(swapped.join("·"))} 드셔서 ${euroRo(recCat)} 골랐어요` });
      if (fresh) parts.push({ v: 15 }); // 점수만 — 문장은 쓰지 않습니다.
      const reasons = parts.filter((x) => x.text).sort((a, b) => b.v - a.v).map((x) => x.text!).slice(0, 3);
      return {
        key: s.place, name: s.name, recCat, category: s.category, lat: s.lat, lng: s.lng, distance: s.distance_m, placeUrl: s.place_url,
        stat: s, wish, reasons, score: parts.reduce((n, x) => n + x.v, 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
    .slice(0, 5);
  return { picks, anyDay };
}

/* ───────────── 「둘러보기」 (§6) ───────────── */

/** rec_courses 한 줄 — 두 곳 모두 최근 4주 지금 시간대에 인증이 있는 코스만 옵니다. 시각 · 머무는 시간은 없습니다. */
export type Course = {
  id: string;
  a_place: string; a_name: string; a_category: string | null; a_lat: number; a_lng: number; a_distance_m: number; a_place_url: string | null;
  a_revisit_rate: number | string | null; a_today_count: number | null; a_last_at: string | null;
  b_place: string; b_name: string; b_category: string | null; b_lat: number; b_lng: number; b_place_url: string | null;
  b_revisit_rate: number | string | null; b_today_count: number | null; b_last_at: string | null;
  between_m: number; users: number;
};

/** 「카페 → 양식」 — 순서와 종류만. */
export const courseTitle = (c: Course) => `${recCategoryOf(c.a_category, c.a_name) ?? c.a_category ?? c.a_name} → ${recCategoryOf(c.b_category, c.b_name) ?? c.b_category ?? c.b_name}`;

/** 「오늘 인증 6건 · 마지막 16:48」 — 오늘 없으면 null. */
export const todayLine = (n: number | null | undefined, last: string | null | undefined) =>
  n ? `오늘 인증 ${n}건${last ? ` · 마지막 ${hhmmOf(last)}` : ""}` : null;

/** 행 카드 Mono 줄(§6-3). */
export function statLine(s: PlaceStat) {
  const today = todayLine(s.today_count, s.last_at);
  if (today) return today;
  if (s.steady_years > 0) return `${s.steady_years}년째 꾸준히 인증 · 이번 주 ${s.week_count}건`;
  return `인증한 사람 ${s.users}명 · 이번 주 ${s.week_count}건`;
}

/* ───────────── 동네 ───────────── */

/** 주소에서 동네 이름 — 동·읍·면·가 토큰, 없으면 지역 칸의 끝(「마포구」). */
export function areaOf(address: string | null | undefined, region?: string | null): string | null {
  const tokens = (address ?? "").trim().split(/\s+/).filter(Boolean);
  const dong = tokens.slice(1).find((t) => t.length >= 2 && /[동읍면가]$/.test(t) && !/\d/.test(t));
  if (dong) return dong;
  const fallback = (region ?? "").trim().split(/\s+/).filter(Boolean).at(-1);
  return fallback && fallback.length >= 2 ? fallback : tokens.slice(1).find((t) => /[구군시]$/.test(t)) ?? null;
}

/**
 * 위치 권한이 없을 때(§12) — 가장 자주 인증한 동네와 그 동네 기록의 가운데 좌표.
 */
export function frequentSpot(rows: Restaurant[]): { name: string; lat: number; lng: number } | null {
  const groups = new Map<string, Restaurant[]>();
  for (const r of verifiedOnly(rows)) {
    const a = areaOf(r.address, r.region);
    if (a && r.lat != null && r.lng != null) groups.set(a, [...(groups.get(a) ?? []), r]);
  }
  const top = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top) return null;
  const [name, list] = top;
  return { name, lat: list.reduce((n, r) => n + r.lat!, 0) / list.length, lng: list.reduce((n, r) => n + r.lng!, 0) / list.length };
}

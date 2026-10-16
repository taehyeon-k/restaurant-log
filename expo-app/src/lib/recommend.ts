import type { Restaurant } from "./types";

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
 * 「지금 뭐 먹지」의 반경 · 거리 감쇠는 lib/rec/config.ts 에 있습니다. 여기 값은 rec_places 를 한 번에 받아 둘 반경입니다.
 */
export const FETCH_MAX_M = 10000;

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const pctOf = (rate: number | string | null | undefined) => Math.round(Number(rate ?? 0) * 100);

/* ───────────── 필터 (§5-2) ───────────── */

export type RecFilter = { inc: RecCategory[]; exc: RecCategory[] };

/**
 * 기본 필터는 비어 있습니다 — 「먹고 싶은 것 · 빼고 싶은 것」은 사용자가 고른 강한 조건만.
 * 최근에 먹은 종류는 빼지 않고 점수에서 조금 내립니다(lib/rec/score.ts 반복 감점, hybrid-v3).
 */
export const defaultFilter = (): RecFilter => ({ inc: [], exc: [] });

/** rec_places 한 줄. slot_dow — 최근 4주 같은 요일 지금 ±1시간 인증 수, slot_any — 요일 상관없이. */
export type PlaceStat = {
  place: string; name: string; category: string | null; kind: string; address: string | null;
  lat: number; lng: number; distance_m: number; place_url: string | null; users: number; revisit_rate: number | string;
  today_count: number; last_at: string | null; week_count: number; steady_years: number; mine: number;
  slot_dow: number; slot_any: number;
};

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

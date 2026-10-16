import { addDays, todayIso } from "./anniversary";
import { metersBetweenLL, norm } from "./geo";
import { eulReul, euroRo } from "./josa";
import { wishKind, type Restaurant, type Wish } from "./types";

/**
 * 추천 탭 v2(HANDOFF-recommend-all §4–6) — 「지금 뭐 먹지 / 둘러보기」의 순수 계산.
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

/** 도보 거리 — 1분에 80m. */
export const WALKS = [5, 10, 15] as const;
export type Walk = (typeof WALKS)[number];
export const DEFAULT_WALK: Walk = 10;
const M_PER_MIN = 80;
export const walkRadius = (min: number) => min * M_PER_MIN;
export const walkMin = (m: number) => Math.max(1, Math.round(m / M_PER_MIN));
/** 5곳이 안 차면 한 단계 늘려 다시 찾습니다(§12) — 15분 다음은 20분. */
export const nextWalk = (min: number) => (min < 15 ? (min < 10 ? 10 : 15) : 20);

export const fmtDistance = (m: number) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1).replace(/\.0$/, "")}km`);
const pad = (n: number) => String(n).padStart(2, "0");
export const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** 0시부터 분 → 「15:10」 */
export const clockOf = (min: number) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(((min % 60) + 60) % 60)}`;
/** 「2시간 30분」 「40분」 */
export const durationOf = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
};
export const pctOf = (rate: number | string | null | undefined) => Math.round(Number(rate ?? 0) * 100);

/** 시각 → 끼니 이름(코스 제목 「디저트 → 이른 저녁」). */
export function slotOf(min: number) {
  const h = (((min % 1440) + 1440) % 1440) / 60;
  if (h < 10.5) return "아침";
  if (h < 14) return "점심";
  if (h < 17) return "오후";
  if (h < 18.5) return "이른 저녁";
  if (h < 21) return "저녁";
  return "늦은 밤";
}

/* ───────────── 필터 (§5-2) ───────────── */

export type RecFilter = { inc: RecCategory[]; exc: RecCategory[]; dist: Walk };

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
  inc: [], exc: recentExclude(rows, today).exc, dist: DEFAULT_WALK,
});

/* ───────────── 「지금 뭐 먹지」 5곳 (§5-5) ───────────── */

/** rec_places 한 줄. */
export type PlaceStat = {
  place: string; name: string; category: string | null; kind: string; address: string | null;
  lat: number; lng: number; distance_m: number; users: number; revisit_rate: number | string;
  today_count: number; last_at: string | null; week_count: number; steady_years: number; mine: number;
};

export type Pick = {
  key: string; name: string; recCat: RecCategory | null; category: string | null;
  lat: number; lng: number; distance: number; address: string | null;
  stat: PlaceStat | null; wish: Wish | null; reasons: string[]; score: number;
};

/** 내 기록장에서 이 가게를 인증한 적이 있는지 — 서버 mine 은 개인 · 연인 기록장을 가리지 않습니다. */
const visitedIn = (rows: Restaurant[], name: string, lat: number, lng: number) =>
  verifiedOnly(rows).some((r) => norm(r.name) === norm(name) && r.lat != null && r.lng != null && metersBetweenLL(r.lat, r.lng, lat, lng) <= 100);

/**
 * 점수 = 재방문율 + 오늘 인증 수 가중 + 위시리스트 보너스 + 아직 안 간 곳 보너스.
 * 까닭 문장은 점수에 가장 크게 기여한 항목 순으로 3개.
 */
export function pickNow(opts: {
  stats: PlaceStat[]; wishes: Wish[]; rows: Restaurant[]; here: { lat: number; lng: number };
  filter: RecFilter; radius: number; yesterday: RecCategory[]; couple: boolean;
}): Pick[] {
  const { stats, wishes, rows, here, filter, radius, yesterday, couple } = opts;
  const pool: Omit<Pick, "reasons" | "score">[] = [];

  for (const s of stats) {
    if (s.kind !== "restaurant" || s.distance_m > radius) continue;
    pool.push({ key: s.place, name: s.name, recCat: recCategoryOf(s.category, s.name), category: s.category, lat: s.lat, lng: s.lng, distance: s.distance_m, address: s.address, stat: s, wish: null });
  }
  for (const w of wishes) {
    if (w.lat == null || w.lng == null || wishKind(w) === "cafe") continue;
    const d = Math.round(metersBetweenLL(here.lat, here.lng, w.lat, w.lng));
    if (d > radius) continue;
    const twin = pool.find((p) => norm(p.name) === norm(w.name) && metersBetweenLL(p.lat, p.lng, w.lat!, w.lng!) <= 100);
    if (twin) { twin.wish ??= w; continue; }
    pool.push({ key: `wish:${w.id}`, name: w.name, recCat: recCategoryOf(w.category, w.name), category: w.category, lat: w.lat, lng: w.lng, distance: d, address: w.where_text, stat: null, wish: w });
  }

  const allowed = (c: RecCategory | null) => (filter.inc.length ? !!c && filter.inc.includes(c) : !c || !filter.exc.includes(c));
  const swapped = yesterday.filter((c) => filter.exc.includes(c));

  return pool
    .filter((p) => allowed(p.recCat))
    .map((p) => {
      const s = p.stat;
      const fresh = !(s && s.mine > 0) && !visitedIn(rows, p.name, p.lat, p.lng);
      const parts: { v: number; text: string }[] = [];
      if (s && pctOf(s.revisit_rate) > 0) parts.push({ v: pctOf(s.revisit_rate), text: `인증한 사람의 ${pctOf(s.revisit_rate)}%가 다시 갔어요` });
      if (s && s.today_count > 0) parts.push({ v: Math.min(s.today_count, 10) * 4, text: `오늘 인증 ${s.today_count}건${s.last_at ? ` · 마지막 ${hhmmOf(s.last_at)}` : ""}` });
      if (p.wish) parts.push({ v: 30, text: couple ? "우리 위시리스트에 담아 둔 곳이에요" : "위시리스트에 담아 둔 곳이에요" });
      if (fresh) parts.push({ v: 15, text: "아직 안 가 본 곳이에요" });
      if (s && s.steady_years > 0) parts.push({ v: 8, text: `${s.steady_years}년째 꾸준히 인증된 곳이에요` });
      // 걸러낸 까닭 — 점수는 아니지만 셋을 채울 때 씁니다.
      const why = swapped.length && p.recCat && !swapped.includes(p.recCat)
        ? `어제 ${eulReul(swapped.join("·"))} 드셔서 ${euroRo(p.recCat)} 골랐어요`
        : `걸어서 ${walkMin(p.distance)}분이에요`;
      const score = parts.reduce((n, x) => n + x.v, 0);
      const reasons = [...parts].sort((a, b) => b.v - a.v).map((x) => x.text).slice(0, 3);
      if (reasons.length < 3) reasons.push(why);
      return { ...p, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
    .slice(0, 5);
}

/* ───────────── 「둘러보기」 (§6) ───────────── */

/** rec_courses 한 줄. */
export type Course = {
  id: string;
  a_place: string; a_name: string; a_category: string | null; a_lat: number; a_lng: number; a_distance_m: number;
  b_place: string; b_name: string; b_category: string | null; b_lat: number; b_lng: number;
  walk_m: number; users: number; gap_min: number; start_min: number;
};

/** 「디저트 → 이른 저녁」 — 첫 곳은 종류, 둘째 곳은 끼니. */
export const courseTitle = (c: Course) => `${c.a_category ?? slotOf(c.start_min)} → ${slotOf(c.start_min + c.gap_min)}`;
/** 총 시간 — 첫 곳에 머문 시간 + 둘째 곳에서의 한 끼(60분으로 칩니다). */
export const courseTotal = (c: Course) => c.gap_min + 60;

/** 행 카드 Mono 줄(§6-3). */
export function statLine(s: PlaceStat) {
  if (s.today_count > 0) return `오늘 인증 ${s.today_count}건${s.last_at ? ` · 마지막 ${hhmmOf(s.last_at)}` : ""}`;
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

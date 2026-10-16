import { metersBetweenLL, norm } from "../geo";
import type { PlaceStat } from "../recommend";
import type { Restaurant, Wish } from "../types";
import { kakaoCategory, recordCategory, type CategoryInfo } from "./categories";
import { REC_CONFIG } from "./config";

/**
 * Stage A — 후보 모으기. 네 출처를 한 목록으로 합치고 같은 가게를 하나로 묶습니다.
 *   kakao     — 서버(/api/recommend/candidates)가 카카오 음식점(FD6) 검색으로 찾은 둘레 가게
 *   community — rec_places: Dinary 인증 기록을 사람 수 · 비율로만 묶은 숫자(남의 기록 원문 없음)
 *   history   — 지금 기록장의 내 기록(연인 기록장이면 둘의 기록)
 *   wish      — 지금 기록장의 위시
 * 같은 가게: 카카오 장소 id 가 같거나, 이름이 같고 100m 안(넘으면 다른 지점). 영업 여부는 모르니 가정하지 않습니다.
 */

/** 서버 후보 한 줄 — 카카오 응답에서 필요한 칸만. */
export type KakaoPlace = {
  id: string; name: string; category_name: string; address: string | null;
  lat: number; lng: number; place_url: string | null;
};

export type Source = "kakao" | "community" | "history" | "wish";

export type Candidate = {
  key: string;
  kakaoId: string | null;
  name: string;
  /** 같은 체인인지 볼 이름 — 「○○ 강남역점」 → 「○○」. */
  chain: string;
  address: string | null;
  lat: number;
  lng: number;
  /** 기준 자리에서의 직선거리(m). 걷는 시간이 아닙니다. */
  distance: number;
  cat: CategoryInfo;
  placeUrl: string | null;
  /** 내 기록의 가격대(1–4)가 있으면 — 카카오는 가격을 주지 않습니다. */
  priceLevel: number | null;
  sources: Source[];
  stat: PlaceStat | null;
  wish: Wish | null;
  /** 이 가게의 내(지금 기록장) 기록 — 보관함 · 날짜 없는 기록은 뺍니다. */
  visits: Restaurant[];
};

export const kakaoIdOf = (url: string | null | undefined) => url?.match(/place\.map\.kakao\.com\/(?:m\/)?(\d+)/)?.[1] ?? null;

/** 「스타벅스 강남역점」 → 「스타벅스」, 「○○국밥 본점」 → 「○○국밥」. 한 단어 이름은 그대로. */
export function chainOf(name: string) {
  const t = name.trim().split(/\s+/);
  if (t.length > 1 && /(점|지점|본점|직영점)$/.test(t[t.length - 1])) t.pop();
  return norm(t.join(""));
}

/** 식사 기록 — 날짜가 있고 보관함이 아닌 맛집 기록. */
export const mealRows = (rows: Restaurant[]) => rows.filter((r) => !r.pending && !!r.visited_at && r.kind === "restaurant");

const same = (a: { name: string; lat: number | null; lng: number | null; kakaoId?: string | null }, b: Candidate) => {
  if (a.kakaoId && b.kakaoId) return a.kakaoId === b.kakaoId;
  if (norm(a.name) !== norm(b.name)) return false;
  if (a.lat == null || a.lng == null) return true;
  return metersBetweenLL(a.lat, a.lng, b.lat, b.lng) <= REC_CONFIG.sameBranchM;
};

export function buildPool(opts: {
  here: { lat: number; lng: number }; radius: number;
  kakao: KakaoPlace[]; stats: PlaceStat[]; rows: Restaurant[]; wishes: Wish[];
}): Candidate[] {
  const { here, radius, kakao, stats, rows, wishes } = opts;
  const pool: Candidate[] = [];
  const dist = (lat: number, lng: number) => Math.round(metersBetweenLL(here.lat, here.lng, lat, lng));
  const inRange = (lat: number | null, lng: number | null): lat is number =>
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && dist(lat, lng) <= radius;

  const add = (c: Omit<Candidate, "chain" | "distance" | "visits" | "priceLevel" | "stat" | "wish" | "sources"> & Partial<Candidate> & { source: Source }) => {
    const hit = pool.find((p) => same(c, p));
    if (hit) {
      if (!hit.sources.includes(c.source)) hit.sources.push(c.source);
      hit.kakaoId ??= c.kakaoId;
      hit.placeUrl ??= c.placeUrl;
      hit.stat ??= c.stat ?? null;
      hit.wish ??= c.wish ?? null;
      // 카카오 종류가 더 자세합니다 — 기록 종류만 있던 자리를 채웁니다.
      if (c.source === "kakao" || !hit.cat.recCat) hit.cat = { ...c.cat, recCat: c.cat.recCat ?? hit.cat.recCat };
      return hit;
    }
    const next: Candidate = {
      key: c.key, kakaoId: c.kakaoId, name: c.name, chain: chainOf(c.name), address: c.address,
      lat: c.lat, lng: c.lng, distance: dist(c.lat, c.lng), cat: c.cat, placeUrl: c.placeUrl,
      priceLevel: null, sources: [c.source], stat: c.stat ?? null, wish: c.wish ?? null, visits: [],
    };
    pool.push(next);
    return next;
  };

  for (const k of kakao) {
    if (!k.id || !k.name || !inRange(k.lat, k.lng)) continue;
    add({ key: `kakao:${k.id}`, kakaoId: k.id, name: k.name, address: k.address, lat: k.lat, lng: k.lng, cat: kakaoCategory(k.category_name, k.name), placeUrl: k.place_url, source: "kakao" });
  }
  for (const s of stats) {
    if (!inRange(s.lat, s.lng)) continue;
    const cat = s.kind === "restaurant" ? recordCategory(s.category, s.name) : { recCat: null, base: null, sub: null, eligible: false };
    add({ key: `stat:${s.place}`, kakaoId: kakaoIdOf(s.place_url), name: s.name, address: s.address, lat: s.lat, lng: s.lng, cat, placeUrl: s.place_url, stat: s, source: "community" });
  }
  for (const r of mealRows(rows)) {
    if (!inRange(r.lat, r.lng)) continue;
    add({ key: `mine:${r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase()}`, kakaoId: kakaoIdOf(r.place_url), name: r.name, address: r.address, lat: r.lat!, lng: r.lng!, cat: recordCategory(r.category, r.name, r.kind), placeUrl: r.place_url ?? null, source: "history" });
  }
  for (const w of wishes) {
    if (!inRange(w.lat, w.lng)) continue;
    add({ key: `wish:${w.id}`, kakaoId: null, name: w.name, address: w.where_text, lat: w.lat!, lng: w.lng!, cat: recordCategory(w.category, w.name), placeUrl: null, wish: w, source: "wish" });
  }

  // 내 기록 · 위시를 후보마다 붙입니다(좌표 없는 기록은 이름으로).
  const meals = mealRows(rows);
  for (const c of pool) {
    c.visits = meals.filter((r) => (kakaoIdOf(r.place_url) && c.kakaoId ? kakaoIdOf(r.place_url) === c.kakaoId : same(r, c)));
    c.wish ??= wishes.find((w) => same(w, c)) ?? null;
    const prices = c.visits.map((r) => r.price_level).filter((n): n is number => n != null);
    c.priceLevel = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  }
  return pool;
}

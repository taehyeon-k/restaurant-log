import type { PlaceStat } from "../../recommend";
import type { Restaurant, Wish } from "../../types";
import type { KakaoPlace } from "../candidates";
import type { RecInput } from "../pipeline";

/** 테스트용 가짜 데이터 — 성수동 둘레. 실제 가게 · 사용자가 아닙니다. */
export const HERE = { lat: 37.5445, lng: 127.056 };
/** 2026-10-16(금) 12:30 KST. */
export const AT = new Date("2026-10-16T03:30:00Z");
export const TODAY = "2026-10-16";

/** 기준점에서 북쪽 n·m, 동쪽 e·m. */
export const at = (north: number, east = 0) => ({
  lat: HERE.lat + north / 111320,
  lng: HERE.lng + east / (111320 * Math.cos((HERE.lat * Math.PI) / 180)),
});

let seq = 1;
export function row(p: Partial<Restaurant> & { name: string }): Restaurant {
  const id = seq++;
  return {
    id, created_at: "2026-01-01T00:00:00Z", user_id: "u1", book_id: "personal", kind: "restaurant",
    category: "한식", region: null, address: null, rating: null, menu: null, menus: [], price_level: null, price_range: null,
    review: null, revisit: false, visited_at: "2026-09-01", keywords: [], lat: null, lng: null, photo_url: null, photo_urls: [],
    cover_index: 0, place_key: null, place_url: null, verified: false, acc: null, verified_at: null, source_record_id: null,
    copied_at: null, pending: false, from_wish: null, ...p,
  };
}

export function wish(p: Partial<Wish> & { name: string }): Wish {
  return {
    id: `w${seq++}`, user_id: "u1", book_id: "personal", where_text: null, category: "한식", note: null, plan_date: null,
    notify: false, lat: null, lng: null, saved_at: "2026-09-16T00:00:00Z", created_at: "2026-09-16T00:00:00Z", ...p,
  };
}

const KAKAO_CAT: Record<string, string> = {
  한식: "음식점 > 한식 > 한정식", 중식: "음식점 > 중식 > 중국요리", 일식: "음식점 > 일식 > 초밥,롤", 양식: "음식점 > 양식 > 이탈리안",
  분식: "음식점 > 분식", 아시안: "음식점 > 아시아음식 > 베트남음식", 고기: "음식점 > 한식 > 육류,고기 > 삼겹살",
  "국밥·탕": "음식점 > 한식 > 해장국", 면: "음식점 > 한식 > 국수 > 칼국수", 술집: "음식점 > 술집 > 호프,요리주점", 간식: "음식점 > 간식 > 제과,베이커리",
};

export function kakao(id: string, name: string, cat: string, north: number, east = 0): KakaoPlace {
  const p = at(north, east);
  return { id, name, category_name: KAKAO_CAT[cat] ?? cat, address: `서울 성동구 성수동 ${id}`, lat: p.lat, lng: p.lng, place_url: `http://place.map.kakao.com/${id}` };
}

export function stat(p: Partial<PlaceStat> & { place: string; name: string; north: number }): PlaceStat {
  const pos = at(p.north);
  return {
    category: "한식", kind: "restaurant", address: null, lat: pos.lat, lng: pos.lng, distance_m: Math.abs(p.north), place_url: null,
    users: 5, revisit_rate: 0.4, today_count: 0, last_at: null, week_count: 0, steady_years: 0, mine: 0, slot_dow: 0, slot_any: 0, ...p,
  };
}

/** 여러 종류가 고루 섞인 20곳(100m 간격 동서남북). */
export function neighborhood(): KakaoPlace[] {
  const cats = ["한식", "중식", "일식", "양식", "분식", "아시안", "고기", "국밥·탕", "면", "한식"];
  return Array.from({ length: 20 }, (_, i) => kakao(String(1000 + i), `가게${i}`, cats[i % cats.length], (i % 2 ? 1 : -1) * (100 + 60 * i), (i % 3) * 80));
}

export const input = (p: Partial<RecInput> = {}): RecInput => ({
  here: HERE, at: AT, filter: { inc: [], exc: [] }, couple: false, bookId: "personal",
  kakao: neighborhood(), kakaoRadius: 1500, stats: [], rows: [], wishes: [], weather: null, ...p,
});

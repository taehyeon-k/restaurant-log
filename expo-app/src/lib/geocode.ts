/**
 * 웹의 src/lib/geocode.ts 를 네이티브로 옮긴 것 — 앱에는 서버가 없으니
 * 네이버 API 키를 쓰는 /api/geocode 는 배포된 Next.js 를 그대로 호출합니다.
 */
import { apiFetch } from "./api";

export type Place = {
  name: string;
  address: string;
  region: string | null;
  lat: number;
  lng: number;
};

export type NearbyPlace = Place & {
  /** 읽은 좌표에서의 거리(m) */
  distance: number;
  category: string | null;
  kind: "restaurant" | "cafe";
};

export type FoodPlace = Place & {
  category: string | null;
  kind: "restaurant" | "cafe";
};

async function ask(params: Record<string, string>, signal?: AbortSignal) {
  const res = await apiFetch(`/api/geocode?${new URLSearchParams(params)}`, { signal });
  if (!res.ok) throw new Error("주소 검색에 실패했습니다");
  const json = (await res.json()) as { places?: Place[] };
  return json.places ?? [];
}

/** 주소·상호 → 좌표 */
export async function forwardGeocode(query: string, signal?: AbortSignal) {
  const q = query.trim();
  if (q.length < 2) return [];
  return ask({ q }, signal);
}

/** 좌표 → 주소 */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<Place | null> {
  const places = await ask({ lat: String(lat), lng: String(lng) }, signal).catch(() => []);
  return places[0] ?? null;
}

/** 이름으로 찾되 음식점·카페만 — 가게 찾기 화면에서 씁니다. */
export async function searchFoodPlaces(query: string, signal?: AbortSignal): Promise<FoodPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await apiFetch(`/api/geocode?${new URLSearchParams({ q, food: "1" })}`, { signal });
  if (!res.ok) throw new Error("가게 검색에 실패했습니다");
  const json = (await res.json()) as { places?: FoodPlace[] };
  return json.places ?? [];
}

/** 좌표 둘레의 음식점과 카페. 좌표는 이 요청에만 쓰고 저장하지 않습니다. */
export async function nearbyPlaces(lat: number, lng: number, signal?: AbortSignal): Promise<NearbyPlace[]> {
  const res = await apiFetch(
    `/api/geocode?${new URLSearchParams({ near: "1", lat: String(lat), lng: String(lng) })}`,
    { signal }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { places?: NearbyPlace[] };
  return json.places ?? [];
}

export type Place = {
  name: string;
  address: string;
  region: string | null;
  lat: number;
  lng: number;
};

async function ask(params: Record<string, string>, signal?: AbortSignal) {
  const res = await fetch(`/api/geocode?${new URLSearchParams(params)}`, {
    signal,
  });
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
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<Place | null> {
  const places = await ask(
    { lat: String(lat), lng: String(lng) },
    signal
  ).catch(() => []);
  return places[0] ?? null;
}

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

/**
 * 이름으로 찾되 음식점·카페만 — 방문 인증의 가게 찾기 화면(§2)에서 씁니다.
 * `forwardGeocode` 와 달리 역·학교 같은 일반 장소는 걸러내고, 거리 제한 없이 전국에서 찾습니다.
 */
export async function searchFoodPlaces(query: string, signal?: AbortSignal): Promise<FoodPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(
    `/api/geocode?${new URLSearchParams({ q, food: "1" })}`,
    { signal }
  );
  if (!res.ok) throw new Error("가게 검색에 실패했습니다");
  const json = (await res.json()) as { places?: FoodPlace[] };
  return json.places ?? [];
}

/**
 * 좌표 둘레의 음식점과 카페를 함께 찾습니다. 방문인증 흐름에서 "여기 어디예요?"
 * 후보로 씁니다 — 둘 중 하나만 찾으면 카페·베이커리가 후보에서 통째로 빠집니다.
 * 좌표는 후보를 찾는 요청에만 쓰고 저장하지 않습니다.
 */
export async function nearbyPlaces(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<NearbyPlace[]> {
  const res = await fetch(
    `/api/geocode?${new URLSearchParams({
      near: "1",
      lat: String(lat),
      lng: String(lng),
    })}`,
    { signal }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { places?: NearbyPlace[] };
  return json.places ?? [];
}

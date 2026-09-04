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
};

/**
 * 좌표 둘레의 음식점·카페. 방문인증 흐름에서 "여기 어디예요?" 후보로 씁니다.
 * 좌표는 후보를 찾는 요청에만 쓰고 저장하지 않습니다.
 */
export async function nearbyPlaces(
  lat: number,
  lng: number,
  kind: "restaurant" | "cafe",
  signal?: AbortSignal
): Promise<NearbyPlace[]> {
  const res = await fetch(
    `/api/geocode?${new URLSearchParams({
      near: "1",
      lat: String(lat),
      lng: String(lng),
      kind,
    })}`,
    { signal }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { places?: NearbyPlace[] };
  return json.places ?? [];
}

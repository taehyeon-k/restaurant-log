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

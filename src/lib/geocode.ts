export type Place = {
  name: string;
  address: string;
  region: string | null;
  lat: number;
  lng: number;
};

const BASE = "https://nominatim.openstreetmap.org";

type NominatimResult = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
};

const regionOf = (a?: Record<string, string>) =>
  a?.city_district ?? a?.borough ?? a?.suburb ?? a?.city ?? null;

/** "서울특별시 중구 …" 처럼 앞에 붙는 국가/우편번호를 걷어냅니다. */
const tidy = (display: string) =>
  display
    .split(", ")
    .filter((part) => !/^대한민국$|^\d{5}$/.test(part))
    .reverse()
    .join(" ");

const toPlace = (r: NominatimResult): Place => ({
  name: r.name ?? "",
  address: tidy(r.display_name),
  region: regionOf(r.address),
  lat: Number(r.lat),
  lng: Number(r.lon),
});

/** 주소·가게명 → 좌표. Nominatim 은 초당 1회 제한이 있어 호출부에서 디바운스합니다. */
export async function forwardGeocode(
  query: string,
  signal?: AbortSignal
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${BASE}/search?q=${encodeURIComponent(
    q
  )}&countrycodes=kr&format=jsonv2&addressdetails=1&limit=5&accept-language=ko`;

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("주소 검색에 실패했습니다");

  return ((await res.json()) as NominatimResult[]).map(toPlace);
}

/** 좌표 → 주소. 지도를 클릭했을 때 주소 칸을 채우는 용도. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<Place | null> {
  const url = `${BASE}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&accept-language=ko`;

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return null;

  const json = (await res.json()) as NominatimResult & { error?: string };
  return json.error ? null : toPlace(json);
}

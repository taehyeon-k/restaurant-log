/**
 * 장소 검색 — 웹의 `src/app/api/geocode/route.ts` 를 그대로 옮긴 것입니다.
 * 앱에는 서버 라우트가 없으므로 카카오 로컬 API 를 직접 부릅니다. 돌려주는
 * 모양(Place / NearbyPlace / FoodPlace)과 거르는 규칙은 웹과 같습니다 —
 * 화면 쪽 코드가 그대로 살아나야 하기 때문입니다.
 */
const KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY?.trim();
const BASE = "https://dapi.kakao.com/v2/local";

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

/** 카카오 카테고리 코드 — 음식점 / 카페 */
const GROUP = { restaurant: "FD6", cafe: "CE7" } as const;

/** "음식점 > 한식 > 냉면" → "한식". 앱이 쓰는 종류 이름으로 좁힙니다. */
const KNOWN = [
  "한식", "중식", "일식", "양식", "아시안", "분식",
  "커피", "디저트", "베이커리", "차",
];

const category = (name?: string) => {
  const parts = (name ?? "").split(">").map((s) => s.trim());
  for (const part of parts.slice(1)) {
    const hit = KNOWN.find((k) => part.startsWith(k));
    if (hit) return hit;
  }
  if (parts.some((p) => p.includes("카페") || p.includes("커피"))) return "커피";
  return null;
};

/** "서울 마포구 동교로 46길" → "서울 마포구" (성남처럼 시 안에 구가 있으면 셋까지) */
const gu = (address?: string) => {
  const t = (address ?? "").split(" ").filter(Boolean);
  if (t.length < 2) return null;

  if (t.length >= 3 && /시$/.test(t[1]) && /구$/.test(t[2])) {
    return `${t[0]} ${t[1]} ${t[2]}`;
  }
  return `${t[0]} ${t[1]}`;
};

type KakaoDoc = Record<string, string> & {
  road_address?: { address_name?: string; building_name?: string };
  address?: { address_name?: string };
};

async function kakao(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<{ documents?: KakaoDoc[] }> {
  if (!KEY) throw new Error("EXPO_PUBLIC_KAKAO_REST_API_KEY 가 설정되지 않았습니다");

  const res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `KakaoAK ${KEY}` },
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`카카오 ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

const toFood =
  (kind: "restaurant" | "cafe", withDistance: boolean) =>
  (json: { documents?: KakaoDoc[] }): NearbyPlace[] =>
    (json?.documents ?? []).map((d) => {
      const address = d.road_address_name || d.address_name;
      return {
        name: d.place_name,
        address,
        region: gu(address),
        category: category(d.category_name),
        lat: Number(d.y),
        lng: Number(d.x),
        distance: withDistance ? Number(d.distance) || 0 : 0,
        kind,
      };
    });

/** 좌표가 같은 결과를 한 번만 남깁니다 — 음식점·카페 목록을 합칠 때 씁니다. */
function dedupe<T extends { lat: number; lng: number }>(list: T[]) {
  const seen = new Set<string>();
  return list.filter((p) => {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 주소·상호 → 좌표 */
export async function forwardGeocode(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [byAddress, byKeyword] = await Promise.all([
    kakao("search/address.json", { query: q, size: "5" }, signal),
    kakao("search/keyword.json", { query: q, size: "10", sort: "accuracy" }, signal),
  ]);

  const places: Place[] = [];

  for (const d of byAddress?.documents ?? []) {
    const address = d.road_address?.address_name ?? d.address_name;
    places.push({
      name: d.road_address?.building_name || "",
      address,
      region: gu(address),
      lat: Number(d.y),
      lng: Number(d.x),
    });
  }

  for (const d of byKeyword?.documents ?? []) {
    const address = d.road_address_name || d.address_name;
    places.push({
      name: d.place_name,
      address,
      region: gu(address),
      lat: Number(d.y),
      lng: Number(d.x),
    });
  }

  return dedupe(places).slice(0, 8);
}

/** 좌표 → 주소 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<Place | null> {
  const json = await kakao(
    "geo/coord2address.json",
    { x: String(lng), y: String(lat) },
    signal
  ).catch(() => null);

  const doc = json?.documents?.[0];
  if (!doc) return null;

  const address = doc.road_address?.address_name ?? doc.address?.address_name ?? "";
  return {
    name: doc.road_address?.building_name || "",
    address,
    region: gu(address),
    lat,
    lng,
  };
}

/**
 * 이름으로 찾되 음식점·카페만 — 방문 인증의 가게 찾기 화면(§2)에서 씁니다.
 * `forwardGeocode` 와 달리 역·학교 같은 일반 장소는 걸러내고, 거리 제한 없이 전국에서 찾습니다.
 */
export async function searchFoodPlaces(
  query: string,
  signal?: AbortSignal
): Promise<FoodPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [restJson, cafeJson] = await Promise.all([
    kakao("search/keyword.json", { query: q, category_group_code: GROUP.restaurant, size: "15" }, signal),
    kakao("search/keyword.json", { query: q, category_group_code: GROUP.cafe, size: "15" }, signal),
  ]);

  return dedupe([
    ...toFood("restaurant", false)(restJson),
    ...toFood("cafe", false)(cafeJson),
  ]);
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
  const common = { x: String(lng), y: String(lat), radius: "500", sort: "distance", size: "10" };

  const [restJson, cafeJson] = await Promise.all([
    kakao("search/category.json", { category_group_code: GROUP.restaurant, ...common }, signal),
    kakao("search/category.json", { category_group_code: GROUP.cafe, ...common }, signal),
  ]).catch(() => [null, null] as const);

  if (!restJson || !cafeJson) return [];

  return [
    ...toFood("restaurant", true)(restJson),
    ...toFood("cafe", true)(cafeJson),
  ].sort((a, b) => a.distance - b.distance);
}

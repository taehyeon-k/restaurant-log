import { coverPhoto, type Kind, type Restaurant } from "./types";

export type Place = {
  key: string;
  name: string;
  kind: Kind;
  category: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  visits: Restaurant[];   // 최신 기록이 맨 앞
  latest: Restaurant;
  rating: number | null;  // 여러 기록의 평균
  price_range: number | null;
  price_level: number | null;
  revisit: boolean;
  keywords: string[];
  /** 방문 기록 중 하나라도 그 자리에서 인증된 것이 있으면 true */
  verified: boolean;
  /** 대표로 쓸 사진 — 최신 기록의 대표사진부터 찾습니다. 없으면 null. */
  photo: string | null;
};

const avg = (list: number[]) =>
  list.length ? list.reduce((s, n) => s + n, 0) / list.length : null;

const nums = (list: (number | null)[]) =>
  list.filter((n): n is number => n != null);

export function groupPlaces(rows: Restaurant[]): Place[] {
  const map = new Map<string, Restaurant[]>();

  for (const r of rows) {
    const key = r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  return [...map.entries()].map(([key, list]) => {
    const visits = [...list].sort((a, b) =>
      (a.visited_at ?? "") < (b.visited_at ?? "") ? 1 : -1
    );
    const latest = visits[0];
   

    return {
      key,
      name: latest.name,
      kind: latest.kind,
      category: latest.category,
      region: latest.region,
      address: latest.address,
      lat: latest.lat,
      lng: latest.lng,
      visits,
      latest,
      rating: avg(nums(visits.map((v) => v.rating))),
      // 가격은 최신값, 최신 기록에 없으면 값이 있는 기록 중 가장 최근 것.
      price_range: latest.price_range ?? nums(visits.map((v) => v.price_range))[0] ?? null,
      price_level: latest.price_level ?? nums(visits.map((v) => v.price_level))[0] ?? null,
      revisit: latest.revisit,
      keywords: [...new Set(visits.flatMap((v) => v.keywords))],
      verified: visits.some((v) => v.verified),
      photo: visits.map((v) => coverPhoto(v)).find(Boolean) ?? null,
    };
  });
}

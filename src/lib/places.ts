import type { Kind, Restaurant } from "./types";

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
      price_range: latest.price_range,
      price_level: latest.price_level,
      revisit: latest.revisit,
      keywords: [...new Set(visits.flatMap((v) => v.keywords))],
    };
  });
}

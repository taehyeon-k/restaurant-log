/**
 * 웹 CaptureFlow.tsx 의 순수 계산을 그대로 옮겼습니다(핸드오프 §4.2) — DOM 을 모릅니다.
 * 상수와 판정 순서를 바꾸면 웹과 인증 규칙이 갈립니다.
 */
import { groupPlaces } from "@/lib/places";
import { findMatchingWish, WISH_NEAR_M, type Kind, type Restaurant, type Wish } from "@/lib/types";
import type { FoodPlace, NearbyPlace } from "@/lib/geocode";

export const PICK_MAX_M = 50; // 인증 가능 최대 거리

export type Geo = { lat: number; lng: number; acc: number };

export type Candidate = {
  id: string;
  name: string;
  kind: Kind;
  category: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  /** 이미 내 기록에 있는 가게 */
  mine: boolean;
  /** 이 후보와 짝지어진 위시 — 담아둔 곳이면 후보 목록 맨 위로 올립니다. */
  wish?: Wish | null;
};

export type PickItem = Candidate & { wish: Wish | null; far: boolean; hot: boolean };

export const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 1000m 가 넘으면 km 로. */
export function formatDistance(m: number) {
  if (m < 1000) return `${m}m`;
  const km = m / 1000;
  return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)}km`;
}

export function metersBetween(a: Geo, lat: number, lng: number) {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLng = rad(lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const toCandidate = (p: ReturnType<typeof groupPlaces>[number], geo: Geo | null): Candidate => ({
  id: `mine:${p.key}`,
  name: p.name,
  kind: p.kind,
  category: p.category,
  region: p.region,
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  distance: geo ? metersBetween(geo, p.lat as number, p.lng as number) : null,
  mine: true,
});

/** 1순위는 내 기록의 가게 — 800m 안쪽을 거리순으로, 최대 4곳. */
export function buildMine(rows: Restaurant[], geo: Geo | null): Candidate[] {
  if (!geo) return [];
  return groupPlaces(rows)
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => toCandidate(p, geo))
    .filter((c) => (c.distance ?? 0) <= 800)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, 4);
}

export const nearToCandidate = (f: NearbyPlace): Candidate => ({
  id: `near:${f.name}:${f.lat},${f.lng}`,
  name: f.name,
  kind: f.kind,
  category: f.category,
  region: f.region,
  address: f.address,
  lat: f.lat,
  lng: f.lng,
  distance: f.distance,
  mine: false,
});

/** 전체 후보: 최대 8곳. */
export function buildCandidates(mine: Candidate[], extra: Candidate[], pickKind: Kind): Candidate[] {
  const taken = new Set(mine.map((c) => c.name));
  return [...mine, ...extra.filter((c) => !taken.has(c.name))]
    .filter((c) => c.kind === pickKind)
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
    .slice(0, 8);
}

/** 담아둔 곳을 맨 위로 — WISH_NEAR_M 이내인 것만 올립니다. */
export function pickCandidates(candidates: Candidate[], wishes: Wish[], geo: Geo | null) {
  if (!geo) return candidates.map((c) => ({ ...c, wish: null as Wish | null }));
  const tagged = candidates.map((c) => ({ ...c, wish: findMatchingWish(wishes, c, WISH_NEAR_M) }));
  return [...tagged.filter((c) => c.wish), ...tagged.filter((c) => !c.wish)];
}

/** 인증은 50m 안에서만 — 위치를 못 읽었으면 제한하지 않습니다. 강조는 고를 수 있는 첫 후보에게만. */
export function pickList(list: ReturnType<typeof pickCandidates>, geo: Geo | null): PickItem[] {
  return list.map((c, i) => {
    const far = !!geo && (c.distance ?? Infinity) > PICK_MAX_M;
    return { ...c, far, hot: i === 0 && !far };
  });
}

export const noneNear = (candidates: Candidate[], list: PickItem[], geo: Geo | null) =>
  !!geo && candidates.length > 0 && list.every((c) => c.far);

/** 가게 찾기 — 내 기록 전체 + 둘레 검색 결과에 전국 검색 결과를 합칩니다. */
export function searchHits(opts: {
  rows: Restaurant[];
  extra: Candidate[];
  apiHits: FoodPlace[];
  query: string;
  geo: Geo | null;
  pickKind: Kind;
}): Candidate[] {
  const { rows, extra, apiHits, query, geo, pickKind } = opts;

  const mineAll = groupPlaces(rows)
    .filter((p) => p.lat != null && p.lng != null && p.kind === pickKind)
    .map((p) => toCandidate(p, geo));
  const taken = new Set(mineAll.map((c) => c.name));
  const pool = [...mineAll, ...extra.filter((c) => !taken.has(c.name) && c.kind === pickKind)].sort(
    (a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)
  );

  const needle = query.trim().toLowerCase();
  if (!needle) return pool;

  const seen = new Set<string>();
  const hits: Candidate[] = [];

  for (const c of pool) {
    if (![c.name, c.category, c.address].some((f) => (f ?? "").toLowerCase().includes(needle))) continue;
    seen.add(norm(c.name));
    hits.push(c);
  }

  for (const p of apiHits) {
    if (p.kind !== pickKind) continue;
    const name = p.name || p.address;
    const key = norm(name);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      id: `api:${key}:${p.lat},${p.lng}`,
      name,
      kind: p.kind,
      category: p.category,
      region: p.region,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      distance: geo ? metersBetween(geo, p.lat, p.lng) : null,
      mine: false,
    });
  }

  return hits.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
}

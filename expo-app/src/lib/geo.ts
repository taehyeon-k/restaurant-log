import type { Restaurant, Wish } from "./types";

/** 이름 비교용 — 공백·대소문자를 무시합니다. */
export const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 이름 없이 주소만으로 찾을 때 같은 곳으로 보는 거리(m). */
export const SAME_SPOT_M = 30;

/** 이름이 같아도 이만큼 넘게 떨어져 있으면 다른 지점(체인점)으로 봅니다(m). */
export const SAME_BRANCH_M = 100;

export function metersBetweenLL(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

type Located = { name: string; address?: string | null; lat?: number | null; lng?: number | null };

/**
 * 같은 가게인지 — 가게는 「이름 + 자리」로 가립니다.
 * 한 건물에 든 가게들은 주소·좌표가 같으니 이름으로 갈리고,
 * 이름이 같은 다른 지점은 주소나 거리(SAME_BRANCH_M)로 갈립니다.
 * 어느 한쪽이라도 자리를 모르면 이름만으로 봅니다.
 */
export function samePlace(a: Located, b: Located): boolean {
  const name = norm(a.name || "");
  if (!name || name !== norm(b.name || "")) return false;
  const aAddr = norm(a.address ?? "");
  if (aAddr && aAddr === norm(b.address ?? "")) return true;
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return metersBetweenLL(a.lat, a.lng, b.lat, b.lng) <= SAME_BRANCH_M;
  }
  return true;
}

type Spot = { name: string; address?: string | null; lat: number; lng: number };

const nearSpot = (x: { lat: number | null; lng: number | null }, p: Spot) =>
  x.lat !== null && x.lng !== null && metersBetweenLL(x.lat, x.lng, p.lat, p.lng) < SAME_SPOT_M;

/**
 * 이미 기록한 가게인지. 이름이 있는 검색 결과는 samePlace 로만 찾습니다 —
 * 거리만 보면 같은 건물의 다른 가게가 이미 기록한 가게로 잡힙니다.
 * 이름 없는 주소 검색일 때만 가까운 기록을 찾아 줍니다.
 */
export function findRecord(rows: Restaurant[], p: Spot): Restaurant | null {
  if (norm(p.name || "")) return rows.find((r) => samePlace(r, p)) ?? null;
  return rows.find((r) => nearSpot(r, p)) ?? null;
}

/** 이미 담아둔 위시인지 — findRecord 와 같은 규칙입니다. */
export function findWish(wishes: Wish[], p: Spot): Wish | null {
  if (norm(p.name || "")) return wishes.find((w) => samePlace({ ...w, address: w.where_text }, p)) ?? null;
  return wishes.find((w) => nearSpot(w, p)) ?? null;
}

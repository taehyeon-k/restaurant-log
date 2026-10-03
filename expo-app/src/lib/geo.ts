import type { Restaurant, Wish } from "./types";

/** 이름 비교용 — 공백·대소문자를 무시합니다. */
export const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 같은 곳으로 보는 거리(m) — 이름이 같거나 30m 이내. */
export const SAME_SPOT_M = 30;

export function metersBetweenLL(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

type Spot = { name: string; lat: number; lng: number };

/** 이미 기록한 가게인지. */
export function findRecord(rows: Restaurant[], p: Spot): Restaurant | null {
  const needle = norm(p.name || "");
  if (needle) {
    const byName = rows.find((r) => norm(r.name) === needle);
    if (byName) return byName;
  }
  return rows.find((r) => r.lat !== null && r.lng !== null && metersBetweenLL(r.lat, r.lng, p.lat, p.lng) < SAME_SPOT_M) ?? null;
}

/** 이미 담아둔 위시인지. */
export function findWish(wishes: Wish[], p: Spot): Wish | null {
  const needle = norm(p.name || "");
  if (needle) {
    const byName = wishes.find((w) => norm(w.name) === needle);
    if (byName) return byName;
  }
  return wishes.find((w) => w.lat !== null && w.lng !== null && metersBetweenLL(w.lat, w.lng, p.lat, p.lng) < SAME_SPOT_M) ?? null;
}

import { metersBetweenLL } from "./geo";

/**
 * 추천 탭의 거리 표시(HANDOFF-recommend-fix-distance-hours §1) — 실제 길과 다를 수 있는 도보 시간 대신 직선거리만.
 */

/** 직선거리(m), 하버사인. */
export const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.round(metersBetweenLL(a.lat, a.lng, b.lat, b.lng));

/** 1000m 미만 「380m」(10m 단위 반올림), 이상 「1.2km」(소수 한 자리). */
export function formatDistance(m: number) {
  const r = Math.round(m / 10) * 10;
  return r < 1000 ? `${r}m` : `${(m / 1000).toFixed(1)}km`;
}

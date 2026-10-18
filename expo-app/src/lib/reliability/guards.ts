/** App-only verification policy. Accuracy thresholds are intentionally deferred. */
export const PICK_MAX_M = 50;
export type Fix = { lat: number; lng: number; acc: number };
export function finitePoint(p: { lat: number | null; lng: number | null } | null): p is { lat: number; lng: number } {
  return !!p && p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}
export function verificationAllowed(fix: Fix | null, place: { lat: number | null; lng: number | null }) {
  if (!finitePoint(fix) || !finitePoint(place)) return false;
  const rad = Math.PI / 180;
  const x = (place.lng - fix.lng) * rad * Math.cos((place.lat + fix.lat) * rad / 2);
  const y = (place.lat - fix.lat) * rad;
  return Math.hypot(x, y) * 6371000 <= PICK_MAX_M;
}
export async function boundedFix(pending: Promise<Fix | null> | null, milliseconds = 8000): Promise<Fix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([pending ?? Promise.resolve(null), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export const usableMealTime = (r: { verified: boolean; captured_at?: string | null; verified_at: string | null }) => {
  const stamp = r.captured_at ?? (r.verified ? r.verified_at : null);
  return stamp && Number.isFinite(Date.parse(stamp)) ? stamp : null;
};

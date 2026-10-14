import { useCallback, useEffect, useRef, useState } from "react";
import { metersBetweenLL } from "@/lib/geo";
import { supabase } from "@/lib/supabase";
import type { Kind, Restaurant, Wish } from "@/lib/types";

/**
 * 지도 탭 → Edge Function places-at 한 번.
 * 외부 API 키는 함수 쪽에만 있습니다 — 앱은 Supabase 주소와 공개 키, 로그인 토큰만 보냅니다.
 */

export type Radius = 25 | 50 | 100;
export const RADII: Radius[] = [25, 50, 100];

export type PlaceAt = {
  id: string; name: string; category: string; kakaoId?: string; myRecordCount: number; isWish: boolean;
  kind: Kind; appCategory: string | null; lat: number; lng: number; addr: string | null;
};
export type PlacesAt =
  | { mode: "building"; building: { id: string; name: string; roadAddr: string; footprint: [number, number][] | null }; floors: { floor: string; places: PlaceAt[] }[] }
  | { mode: "radius"; addr: string; radius: Radius; places: (PlaceAt & { distanceM: number })[] };

export type BuildingData = Extract<PlacesAt, { mode: "building" }>;
export type RadiusData = Extract<PlacesAt, { mode: "radius" }>;

type Pt = { lat: number; lng: number };
export type PlacesAtState =
  | { status: "idle" }
  | { status: "loading"; point: Pt; radius: Radius | null }
  | { status: "done"; point: Pt; data: PlacesAt }
  | { status: "error"; point: Pt; radius: Radius | null };

const ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/places-at`;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** 서버는 2초 안에 건물을 못 찾으면 스스로 둘레로 바꿉니다. 앱은 망 왕복을 더해 이만큼 기다립니다. */
const CLIENT_MS = 2600;
const TTL = 10 * 60_000;

/* ── 메모리 캐시 — 좌표(≈11m) 키 + 건물 경계 안이면 같은 건물 ── */

const byKey = new Map<string, { at: number; data: PlacesAt }>();
const byBuilding = new Map<string, { at: number; data: BuildingData }>();
const keyOf = (p: Pt, r: Radius | null) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${r ?? "auto"}`;

/** 점이 고리([lat, lng]) 안에 있는지 — 반직선 교차. */
function inRing(p: Pt, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function fromCache(p: Pt, r: Radius | null): PlacesAt | null {
  const now = Date.now();
  const hit = byKey.get(keyOf(p, r));
  if (hit && now - hit.at < TTL) return hit.data;
  if (r != null) return null;
  for (const b of byBuilding.values()) {
    const fp = b.data.building.footprint;
    if (now - b.at < TTL && fp && fp.length >= 4 && inRing(p, fp)) return b.data;
  }
  return null;
}

function remember(p: Pt, r: Radius | null, data: PlacesAt) {
  const at = Date.now();
  byKey.set(keyOf(p, r), { at, data });
  if (data.mode === "building") byBuilding.set(data.building.id, { at, data });
  if (byKey.size > 200) byKey.delete(byKey.keys().next().value!);
  if (byBuilding.size > 100) byBuilding.delete(byBuilding.keys().next().value!);
}

async function request(p: Pt, r: Radius | null, outer: AbortSignal): Promise<PlacesAt> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");
  const inner = new AbortController();
  const stop = () => inner.abort();
  outer.addEventListener("abort", stop);
  const timer = setTimeout(stop, CLIENT_MS);
  try {
    const q = new URLSearchParams({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), ...(r ? { radius: String(r) } : {}) });
    const res = await fetch(`${ENDPOINT}?${q}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON, "x-region": "ap-northeast-2" },
      signal: inner.signal,
    });
    if (!res.ok) throw new Error(`places-at ${res.status}`);
    return (await res.json()) as PlacesAt;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", stop);
  }
}

/** 길게 누른 자리의 가게들. 새로 누르면 이전 요청은 버립니다. 오류·시간 초과면 50m 둘레로 한 번 더. */
export function usePlacesAt() {
  const [state, setState] = useState<PlacesAtState>({ status: "idle" });
  const ctrl = useRef<AbortController | null>(null);

  const run = useCallback(async (point: Pt, radius: Radius | null) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;

    const hit = fromCache(point, radius);
    if (hit) return setState({ status: "done", point, data: hit });
    setState({ status: "loading", point, radius });

    const attempts: (Radius | null)[] = radius == null ? [null, 50] : [radius];
    for (const r of attempts) {
      try {
        const data = await request(point, r, c.signal);
        if (c.signal.aborted) return;
        remember(point, r, data);
        if (r !== radius) remember(point, radius, data);
        return setState({ status: "done", point, data });
      } catch (e) {
        if (c.signal.aborted) return; // 새로 눌렀거나 닫았음
        if (__DEV__) console.warn("[places-at] request failed", { radius: r, error: String(e) });
      }
    }
    setState({ status: "error", point, radius });
  }, []);

  const open = useCallback((lat: number, lng: number) => { run({ lat, lng }, null); }, [run]);
  const setRadius = useCallback((r: Radius) => { if (state.status !== "idle") run(state.point, r); }, [run, state]);
  const retry = useCallback(() => {
    if (state.status === "idle") return;
    run(state.point, state.status === "done" ? (state.data.mode === "radius" ? state.data.radius : null) : state.radius);
  }, [run, state]);
  const close = useCallback(() => { ctrl.current?.abort(); setState({ status: "idle" }); }, []);

  useEffect(() => () => ctrl.current?.abort(), []);
  return { state, open, setRadius, retry, close };
}

/* ── 내 기록·위시 붙이기 — 서버와 같은 규칙(이름 + 100m). 앱이 가진 최신 기록으로 다시 셉니다. ── */

const loose = (s: string) => s.toLowerCase().replace(/[\s()\[\]·.,'"&\-_/]/g, "");
function sameName(a: string, b: string) {
  const x = loose(a), y = loose(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && long.startsWith(short);
}
const near = (p: PlaceAt, x: { lat: number | null; lng: number | null }) =>
  x.lat != null && x.lng != null && metersBetweenLL(p.lat, p.lng, x.lat, x.lng) <= 100;

/** 이 가게의 내 기록(보관함의 미완성 기록은 뺍니다). */
export const recordsAt = (p: PlaceAt, rows: Restaurant[]) => rows.filter((r) => !r.pending && near(p, r) && sameName(p.name, r.name));
export const wishAt = (p: PlaceAt, wishes: Wish[]) => wishes.some((w) => near(p, w) && sameName(p.name, w.name));

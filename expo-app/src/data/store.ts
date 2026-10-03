import { useSyncExternalStore } from "react";
import type { Kind } from "@/lib/types";

/**
 * 웹 MobileShell 이 useState 로 들고 있던 "화면 사이를 오가는 가벼운 선택"을 담는 작은 저장소 —
 * 지도에서 찍은 검색 결과(ghost)·마커 필터·종류(맛집/카페). 라우트를 넘나들어도 유지돼야 해서 모듈에 둡니다.
 */
export type Ghost = { name: string; address: string; lat: number; lng: number } | null;
export type MarkerFilter = "all" | "visited" | "wish";

/** 위시 자리 고르기 화면(wish/spot)이 돌려주는 값 — 폼이 읽고 비웁니다. */
export type SpotPick = { lat: number; lng: number; found?: { name: string; address: string } } | null;

type State = { kind: Kind; markerFilter: MarkerFilter; ghost: Ghost; spotPick: SpotPick };
let state: State = { kind: "restaurant", markerFilter: "all", ghost: null, spotPick: null };
const subs = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function useAppState() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state
  );
}

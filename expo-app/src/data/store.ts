import { useSyncExternalStore } from "react";
import type { Kind } from "@/lib/types";

/**
 * 웹 MobileShell 이 useState 로 들고 있던 "화면 사이를 오가는 가벼운 선택"을 담는 작은 저장소 —
 * 지도에서 찍은 검색 결과(ghost)·마커 필터·종류(맛집/카페). 라우트를 넘나들어도 유지돼야 해서 모듈에 둡니다.
 */
export type Ghost = { name: string; address: string; lat: number; lng: number } | null;
export type MarkerFilter = "all" | "visited" | "wish";
/** 지도 시트 머리의 전환 — 맛집 기록 / 위시리스트(커뮤니티 핸드오프 §2). */
export type MapSegment = "records" | "wish";
/** 커뮤니티 탭 — 마지막에 본 곳을 기억합니다(§4). */
export type CommunityTab = "friends" | "recs" | "ranking" | "board";

/** 위시 자리 고르기 화면(wish/spot)이 돌려주는 값 — 폼이 읽고 비웁니다. */
export type SpotPick = { lat: number; lng: number; found?: { name: string; address: string } } | null;

type State = {
  kind: Kind; markerFilter: MarkerFilter; ghost: Ghost; spotPick: SpotPick;
  mapSegment: MapSegment; communityTab: CommunityTab;
  /** 이번에 커뮤니티에 들어오기 직전의 last_seen_community_at — 친구 줄의 「새 기록」 테두리 기준. */
  communitySeenSince: string | null;
  /** 추천 탭에서 칩으로 다시 넣은 종류 — 그 날만 기억합니다(HANDOFF-recommend §4-5). */
  recExcludeOverride: { date: string; categories: string[] } | null;
};
let state: State = {
  kind: "restaurant", markerFilter: "all", ghost: null, spotPick: null,
  mapSegment: "records", communityTab: "friends", communitySeenSince: null, recExcludeOverride: null,
};
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

import { useSyncExternalStore } from "react";
import type { RecFilter } from "@/lib/recommend";
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
  /** 추천 탭 필터 — 사용자가 바꾼 값은 그 날만 기억합니다(HANDOFF-recommend-all §5-2). */
  recFilter: (RecFilter & { date: string }) | null;
  /** 「여기로 갈게요」 · 「이 코스로 가기」 · 「코스 잇기」로 고른 가게 — 2시간 안에 찍으면 식당 후보 맨 위로(§5-4). */
  recHeading: RecHeading | null;
  /** 지금 따라가는 코스 — 다 인증하면 촬영 완료 화면에 「코스 완주」(§10). */
  recCourse: RecCourse | null;
  /** 추천 탭이 마지막으로 읽은 자리(GPS 또는 자주 기록한 동네) — 코스 · 투어 상세가 같은 자리로 다시 셉니다. */
  recHere: RecHere | null;
  /** 추천 탭 머리에서 고른 자리 · 시각 — null 이면 지금 위치 · 지금 시각. 앱을 닫으면 잊습니다. */
  recPlace: RecHere | null;
  recAt: number | null;
};

export type RecHeading = { placeKey: string; name: string; lat: number; lng: number; at: number };
export type RecCourse = { id: string; date: string; places: { placeKey: string; name: string }[] };
export type RecHere = { lat: number; lng: number; name: string | null; fallback: boolean };
let state: State = {
  kind: "restaurant", markerFilter: "all", ghost: null, spotPick: null,
  mapSegment: "records", communityTab: "friends", communitySeenSince: null,
  recFilter: null, recHeading: null, recCourse: null, recHere: null, recPlace: null, recAt: null,
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

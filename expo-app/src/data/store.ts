import { useSyncExternalStore } from "react";
import type { RecFilter } from "@/lib/recommend";
import type { SourceKind } from "@/lib/sourceLink";
import type { Kind } from "@/lib/types";

/**
 * 웹 MobileShell 이 useState 로 들고 있던 "화면 사이를 오가는 가벼운 선택"을 담는 작은 저장소 —
 * 지도에서 찍은 검색 결과(ghost)·종류(맛집/카페). 라우트를 넘나들어도 유지돼야 해서 모듈에 둡니다.
 */
export type Ghost = { name: string; address: string; lat: number; lng: number } | null;
/** 지도 시트 머리의 전환 — 맛집 기록 / 위시리스트(커뮤니티 핸드오프 §2). */
export type MapSegment = "records" | "wish";
/** 커뮤니티 탭 — 마지막에 본 곳을 기억합니다(§4). */
export type CommunityTab = "friends" | "recs" | "ranking" | "board";

/** 링크로 담기(wish/link)를 위시 폼에서 열었을 때 고른 가게 + 출처 — 폼이 읽고 비웁니다. */
export type LinkPick = {
  name: string; address: string; category: string | null; lat: number; lng: number; url: string; kind: SourceKind;
} | null;

type State = {
  kind: Kind; ghost: Ghost; linkPick: LinkPick;
  /** 로그인 전에 공유 시트로 받은 링크 — 로그인이 끝나면 wish/link 로 이어갑니다. */
  pendingShare: { url: string; kind: SourceKind } | null;
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
  /** 최근 화면에 보인 추천 카드 — 그 가게를 인증하면 추천 세션과 잇습니다(features/recommend/log.ts). 좌표는 기기에만. */
  recShown: RecShown[];
};

export type RecHeading = { placeKey: string; name: string; lat: number; lng: number; at: number; sessionId?: string };
export type RecShown = { sessionId: string; key: string; position: number; name: string; lat: number; lng: number; at: number };
export type RecCourse = { id: string; date: string; places: { placeKey: string; name: string }[] };
export type RecHere = { lat: number; lng: number; name: string | null; fallback: boolean };
let state: State = {
  kind: "restaurant", ghost: null, linkPick: null, pendingShare: null,
  mapSegment: "records", communityTab: "friends", communitySeenSince: null,
  recFilter: null, recHeading: null, recCourse: null, recHere: null, recPlace: null, recAt: null, recShown: [],
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

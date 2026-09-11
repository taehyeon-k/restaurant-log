"use client";

import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Restaurant, Wish } from "@/lib/types";
import MobileShell from "./mobile/MobileShell";

/**
 * 아이패드 미니(세로 744px)부터 데스크톱 화면, 그 미만은 모바일.
 * 높이 조건은 폴드 가로(841×673)를 모바일로 남기기 위한 것입니다 —
 * 아이패드 미니는 가로여도 높이가 744px라 데스크톱에 남습니다.
 * 지도 인스턴스가 두 개 생기지 않게 한쪽만 마운트합니다
 * (지도를 display:none 안에 두면 크기 계산이 깨집니다).
 */
export default function Shell({
  rows,
  wishes,
  desktop,
}: {
  rows: Restaurant[];
  wishes: Wish[];
  desktop: React.ReactNode;
}) {
    const isMobile = useMediaQuery("(max-width: 743px), (max-height: 700px)");

  // 첫 페인트에서는 화면 크기를 모릅니다 — 종이색 바탕만 깔고 기다립니다.
  if (isMobile === null) return <div className="h-dvh bg-paper" />;

  return isMobile ? <MobileShell rows={rows} wishes={wishes} /> : <>{desktop}</>;
}

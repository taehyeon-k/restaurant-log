"use client";

import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Restaurant } from "@/lib/types";
import MobileShell from "./mobile/MobileShell";

/**
 * 820px 을 넘으면 기존 데스크톱 화면, 이하면 모바일 화면.
 * 지도 인스턴스가 두 개 생기지 않게 한쪽만 마운트합니다
 * (Leaflet 은 display:none 안에서 크기 계산이 깨집니다).
 */
export default function Shell({
  rows,
  desktop,
}: {
  rows: Restaurant[];
  desktop: React.ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 820px)");

  // 첫 페인트에서는 화면 크기를 모릅니다 — 종이색 바탕만 깔고 기다립니다.
  if (isMobile === null) return <div className="h-dvh bg-paper" />;

  return isMobile ? <MobileShell rows={rows} /> : <>{desktop}</>;
}

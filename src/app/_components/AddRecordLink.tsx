"use client";

import { useRouter } from "next/navigation";
import { useMapViewRef } from "./Workspace";

/**
 * "+ 기록 추가" — 지금 지도가 보고 있는 자리·확대값을 그대로 /add 로 넘겨,
 * 새 기록 화면의 지도가 서울 시내 기본값으로 갑자기 축소되지 않게 합니다.
 */
export default function AddRecordLink({ className, children }: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const mapView = useMapViewRef();

  return (
    <a
      href="/add"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        const v = mapView.current;
        const qs = v
          ? `?${new URLSearchParams({
              clat: String(v.lat),
              clng: String(v.lng),
              czoom: String(v.zoom),
            })}`
          : "";
        router.push(`/add${qs}`);
      }}
    >
      {children}
    </a>
  );
}

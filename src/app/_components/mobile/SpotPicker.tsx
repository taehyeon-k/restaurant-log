"use client";

import { useEffect, useRef } from "react";
import { loadNaverMaps } from "@/lib/loadNaverMaps";
import { BookmarkIcon } from "./ui";

/**
 * 전체 화면 지도로 위시의 자리를 고릅니다(HANDOFF-wish.md §4, SpotPicker).
 * LocationPickerMap 과 달리 지도를 움직여 가운데 십자(책갈피)에 맞추는
 * 방식이라 마커를 두지 않고, 지도 중심 좌표를 그대로 읽습니다.
 */
export default function SpotPicker({
  initial,
  onCancel,
  onPick,
}: {
  initial: { lat: number; lng: number } | null;
  onCancel: () => void;
  onPick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const centerRef = useRef({ lat: initial?.lat ?? 37.5665, lng: initial?.lng ?? 126.978 });

  useEffect(() => {
    let cancelled = false;
    loadNaverMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const maps = naver.maps;
      const map = new maps.Map(containerRef.current, {
        center: new maps.LatLng(centerRef.current.lat, centerRef.current.lng),
        zoom: initial ? 16 : 13,
        keyboardShortcuts: false,
        zoomControl: true,
        zoomControlOptions: { position: maps.Position.BOTTOM_RIGHT },
      });
      maps.Event.addListener(map, "idle", () => {
        const c = map.getCenter() as naver.maps.LatLng;
        centerRef.current = { lat: c.lat(), lng: c.lng() };
      });
      mapRef.current = map;
    }).catch((error: unknown) => console.error(error));

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-[1600] flex flex-col bg-paper">
      <div
        className="relative z-10 flex shrink-0 items-center justify-between px-3.5 pb-3"
        style={{ paddingTop: "max(48px, calc(env(safe-area-inset-top) + 8px))" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] text-faint"
        >
          취소
        </button>
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-faint">PICK A SPOT</span>
        <button
          type="button"
          onClick={() => onPick(centerRef.current.lat, centerRef.current.lng)}
          className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] font-medium text-brick"
        >
          이 자리
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="naver-map-tone absolute inset-0 h-full w-full" />

        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full"
          style={{ filter: "drop-shadow(0 2px 5px rgba(28,26,23,.35))" }}
        >
          <div className="rounded-full border-[1.4px] border-card bg-brick p-[7px]">
            <BookmarkIcon size={20} fill="#fbfaf6" stroke="#fbfaf6" strokeWidth={0} />
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-6 rounded-[16px] border border-line bg-card px-4 py-3 text-center text-[12px] leading-[1.6] text-muted shadow-[0_8px_20px_rgba(28,26,23,.1)]">
          지도를 움직여 가운데 표시를 가게 자리에 맞춰주세요.
        </div>
      </div>
    </div>
  );
}

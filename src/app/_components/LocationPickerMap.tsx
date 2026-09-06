"use client";

import { useEffect, useRef } from "react";
import { loadNaverMaps } from "@/lib/loadNaverMaps";
import { pinIcon } from "./mapPin";

export default function LocationPickerMap({
  center, category, revisit, onChange, initialView,
}: {
  center: { lat: number; lng: number } | null;
  category: string | null;
  revisit: boolean;
  onChange: (lat: number, lng: number) => void;
  /** 처음 띄울 때의 중심·확대값 — 없으면 서울 시내 기본값을 씁니다. */
  initialView?: { lat: number; lng: number; zoom: number };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    loadNaverMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const maps = naver.maps;
      const map = new maps.Map(containerRef.current, {
        center: initialView
          ? new maps.LatLng(initialView.lat, initialView.lng)
          : new maps.LatLng(37.5665, 126.978),
        zoom: initialView?.zoom ?? 13,
        keyboardShortcuts: false, zoomControl: true,
        zoomControlOptions: { position: maps.Position.BOTTOM_RIGHT },
      });
      maps.Event.addListener(map, "click", (event: naver.maps.PointerEvent) => {
        onChangeRef.current((event.coord as naver.maps.LatLng).lat(), (event.coord as naver.maps.LatLng).lng());
      });
      mapRef.current = map;
    }).catch((error: unknown) => console.error(error));

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // initialView 는 처음 뜰 때 한 번만 쓰고, 이후 바뀌어도 지도를 다시 만들지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lat = center?.lat ?? null;
  const lng = center?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const maps = naver.maps;
    if (lat === null || lng === null) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    const position = new maps.LatLng(lat, lng);
    const markerIcon = pinIcon(maps, { category, revisit });
    if (markerRef.current) {
      markerRef.current.setPosition(position);
      markerRef.current.setIcon(markerIcon);
    } else {
      markerRef.current = new maps.Marker({ position, map, icon: markerIcon });
    }
    if (map.getZoom() < 15) map.morph(position, 16, { duration: 700 });
    else map.panTo(position);
  }, [lat, lng, category, revisit]);

  return <div ref={containerRef} className="naver-map-tone absolute inset-0 h-full w-full" />;
}

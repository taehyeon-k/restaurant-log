"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

export default function LocationPickerMap({
  center,
  onChange,
}: {
  center: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 지도 생성 — 한 번만.
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false }).setView(
        [37.5665, 126.978],
        13
      );

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "paper-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("click", (event) => {
        const { lat, lng } = event.latlng;
        onChangeRef.current(lat, lng);
      });

      leafletRef.current = L;
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 선택 위치가 바뀌면 핀을 옮기고 그쪽으로 이동.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (!center) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([center.lat, center.lng]);
    } else {
      markerRef.current = L.circleMarker([center.lat, center.lng], {
        radius: 10,
        weight: 3,
        color: "#8f3f20",
        fillColor: "#b4552d",
        fillOpacity: 1,
      }).addTo(map);
    }

    if (map.getZoom() < 15) map.flyTo([center.lat, center.lng], 16, { duration: 0.7 });
    else map.panTo([center.lat, center.lng]);
  }, [center]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

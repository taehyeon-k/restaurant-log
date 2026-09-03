"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { pinIcon } from "./mapPin";

export default function LocationPickerMap({
  center,
  category,
  revisit,
  onChange,
}: {
  center: { lat: number; lng: number } | null;
  category: string | null;
  revisit: boolean;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        keyboard: false,
      }).setView([37.5665, 126.978], 13);

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

  // center 는 글자를 칠 때마다 새 객체로 만들어집니다. 그대로 쓰면
  // 타이핑마다 지도가 다시 움직이므로 숫자로 꺼내 씁니다.
  const lat = center?.lat ?? null;
  const lng = center?.lng ?? null;

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;

    if (!L || !map) return;

    if (lat === null || lng === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const icon = pinIcon(L, {
      category,
      revisit,
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(icon);
    } else {
      markerRef.current = L.marker([lat, lng], {
        icon,
      }).addTo(map);
    }

    if (map.getZoom() < 15) {
      map.flyTo([lat, lng], 16, {
        duration: 0.7,
      });
    } else {
      map.panTo([lat, lng]);
    }
  }, [lat, lng, category, revisit]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

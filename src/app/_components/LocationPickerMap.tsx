"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

export default function LocationPickerMap({
  onChange,
}: {
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: LeafletMap | null = null;
    let marker: CircleMarker | null = null;
    let cancelled = false;

    async function initializeMap() {
      const L = await import("leaflet");

      if (cancelled || !containerRef.current) return;

      const leafletMap = L.map(containerRef.current, {
        zoomControl: false,
      }).setView([37.5665, 126.978], 13);

      map = leafletMap;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(leafletMap);

      L.control
        .zoom({
          position: "bottomright",
        })
        .addTo(leafletMap);

      leafletMap.on("click", (event) => {
        const { lat, lng } = event.latlng;

        if (marker) {
          marker.setLatLng([lat, lng]);
        } else {
          marker = L.circleMarker([lat, lng], {
            radius: 10,
            weight: 3,
            color: "#8f3f20",
            fillColor: "#b4552d",
            fillOpacity: 1,
          }).addTo(leafletMap);
        }

        onChange(lat, lng);
      });
    }

    initializeMap();

    return () => {
      cancelled = true;

      if (map) {
        map.remove();
      }
    };
  }, [onChange]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
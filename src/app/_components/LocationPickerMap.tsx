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

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;

    if (!L || !map) return;

    if (!center) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const icon = pinIcon(L, {
      category,
      revisit,
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([center.lat, center.lng]);
      markerRef.current.setIcon(icon);
    } else {
      markerRef.current = L.marker([center.lat, center.lng], {
        icon,
      }).addTo(map);
    }

    if (map.getZoom() < 15) {
      map.flyTo([center.lat, center.lng], 16, {
        duration: 0.7,
      });
    } else {
      map.panTo([center.lat, center.lng]);
    }
  }, [center, category, revisit]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import type { Restaurant } from "@/lib/types";
import { useHover } from "./Workspace";

export default function MapPane({
  rows,
  selectedId,
}: {
  rows: Restaurant[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const { hover, setHover } = useHover();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRefs = useRef<Map<number, CircleMarker>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;

    let map: LeafletMap | null = null;
    let cancelled = false;

    async function initializeMap() {
      const L = await import("leaflet");

      if (cancelled || !containerRef.current) return;

      const leafletMap = L.map(containerRef.current, {
        zoomControl: false,
      }).setView([37.5665, 126.978], 12);

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

      markerRefs.current.clear();

      const rowsWithCoordinates = rows.filter(
        (
          r
        ): r is Restaurant & {
          lat: number;
          lng: number;
        } => r.lat !== null && r.lng !== null
      );

      for (const r of rowsWithCoordinates) {
        const active = selectedId === r.id;
        const normalColor = r.revisit ? "#b4552d" : "#a9a297";

        const marker = L.circleMarker([r.lat, r.lng], {
          radius: active ? 11 : 9,
          weight: active ? 3 : 2,
          color: active ? "#8f3f20" : normalColor,
          fillColor: active ? "#b4552d" : normalColor,
          fillOpacity: 0.92,
        }).addTo(leafletMap);

        const label = document.createElement("div");

        const name = document.createElement("div");
        name.textContent = r.name;
        name.style.fontWeight = "600";
        name.style.whiteSpace = "nowrap";

        const rating = document.createElement("div");
        rating.textContent = r.rating?.toFixed(1) ?? "—";
        rating.style.fontSize = "11px";
        rating.style.opacity = "0.65";

        label.append(name, rating);

        marker.bindTooltip(label, {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "restaurant-map-tooltip",
        });

        marker.on("click", () => {
          router.push(`/?id=${r.id}`, {
            scroll: false,
          });
        });

        marker.on("mouseover", () => {
          setHover(r.id);
        });

        marker.on("mouseout", () => {
          setHover(null);
        });

        markerRefs.current.set(r.id, marker);
      }

      const selected = rowsWithCoordinates.find(
        (r) => r.id === selectedId
      );

      if (selected) {
        leafletMap.setView([selected.lat, selected.lng], 15);
      } else if (rowsWithCoordinates.length === 1) {
        leafletMap.setView(
          [
            rowsWithCoordinates[0].lat,
            rowsWithCoordinates[0].lng,
          ],
          15
        );
      } else if (rowsWithCoordinates.length > 1) {
        const bounds = L.latLngBounds(
          rowsWithCoordinates.map((r) => [r.lat, r.lng])
        );

        leafletMap.fitBounds(bounds, {
          paddingTopLeft: [40, 120],
          paddingBottomRight: [40, 40],
          maxZoom: 15,
        });
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
      markerRefs.current.clear();

      if (map) {
        map.remove();
      }
    };
  }, [rows, selectedId, router, setHover]);

  useEffect(() => {
    const rowById = new Map(rows.map((r) => [r.id, r]));

    for (const [id, marker] of markerRefs.current) {
      const row = rowById.get(id);

      if (!row) continue;

      const active = hover === id || selectedId === id;
      const normalColor = row.revisit ? "#b4552d" : "#a9a297";

      marker.setStyle({
        radius: active ? 11 : 9,
        weight: active ? 3 : 2,
        color: active ? "#8f3f20" : normalColor,
        fillColor: active ? "#b4552d" : normalColor,
        fillOpacity: 0.92,
      });

      if (active) {
        marker.bringToFront();
      }
    }
  }, [hover, selectedId, rows]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
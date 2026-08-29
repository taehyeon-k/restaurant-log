"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { pinColor, type Restaurant } from "@/lib/types";
import { useHover, usePlace } from "./Workspace";

type Placed = Restaurant & { lat: number; lng: number };

const placed = (rows: Restaurant[]) =>
  rows.filter((r): r is Placed => r.lat !== null && r.lng !== null);

function styleFor(row: Restaurant, active: boolean) {
  const base = pinColor(row.category);
  return {
    radius: active ? 11 : 9,
    weight: active ? 3 : 2,
    color: active ? "#3d3833" : base,
    fillColor: base,
    fillOpacity: row.revisit ? 0.95 : 0.45,
  };
}

export default function MapPane({
  rows,
  selectedId,
}: {
  rows: Restaurant[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const { hover, setHover } = useHover();
  const { place } = usePlace();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerRefs = useRef<Map<number, CircleMarker>>(new Map());
  const readyRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);

  const handlers = useRef({ router, setHover });
  handlers.current = { router, setHover };

  // 1. 지도 생성 — 마운트 시 한 번만.
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false }).setView(
        [37.5665, 126.978],
        12
      );

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "paper-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      leafletRef.current = L;
      mapRef.current = map;
      readyRef.current = true;

      syncRef.current?.();
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      markerRefs.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. 결과 목록이 바뀔 때만 마커를 추가/제거 — 지도는 그대로 둡니다.
  useEffect(() => {
    const sync = () => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      const visible = placed(rows);
      const next = new Set(visible.map((r) => r.id));

      for (const [id, marker] of markerRefs.current) {
        if (!next.has(id)) {
          marker.remove();
          markerRefs.current.delete(id);
        }
      }

      for (const r of visible) {
        const existing = markerRefs.current.get(r.id);

        if (existing) {
          existing.setLatLng([r.lat, r.lng]);
          existing.setStyle(styleFor(r, hover === r.id || selectedId === r.id));
          continue;
        }

        const marker = L.circleMarker([r.lat, r.lng], styleFor(r, false)).addTo(map);

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

        marker.on("click", () =>
          handlers.current.router.push(`/?id=${r.id}`, { scroll: false })
        );
        marker.on("mouseover", () => handlers.current.setHover(r.id));
        marker.on("mouseout", () => handlers.current.setHover(null));

        markerRefs.current.set(r.id, marker);
      }
    };

    syncRef.current = sync;
    if (readyRef.current) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // 3. 호버·선택은 다시 칠하기만.
  useEffect(() => {
    const rowById = new Map(rows.map((r) => [r.id, r]));

    for (const [id, marker] of markerRefs.current) {
      const row = rowById.get(id);
      if (!row) continue;

      const active = hover === id || selectedId === id;
      marker.setStyle(styleFor(row, active));
      if (active) marker.bringToFront();
    }
  }, [hover, selectedId, rows]);

   // 4. 지도 검색으로 고른 장소 — 라벨을 눌러 바로 기록 추가.
  const ghostRef = useRef<CircleMarker | null>(null);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    ghostRef.current?.remove();
    ghostRef.current = null;

    if (!place) return;

    const href = `/add?${new URLSearchParams({
      name: place.name,
      address: place.address,
      lat: String(place.lat),
      lng: String(place.lng),
    })}`;

    const ghost = L.circleMarker([place.lat, place.lng], {
      radius: 10,
      weight: 2,
      dashArray: "3 3",
      color: "#3d3833",
      fillColor: "#8a8377",
      fillOpacity: 0.2,
    }).addTo(map);

    const label = document.createElement("div");
    label.style.cursor = "pointer";

    const title = document.createElement("div");
    title.textContent = place.name;
    title.style.fontWeight = "600";
    title.style.whiteSpace = "nowrap";

    const cta = document.createElement("div");
    cta.textContent = "+ 기록 추가";
    cta.style.fontSize = "11px";
    cta.style.color = "#b4552d";
    cta.style.marginTop = "1px";

    label.append(title, cta);
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      handlers.current.router.push(href);
    });

    ghost.bindTooltip(label, {
      permanent: true,
      interactive: true,
      direction: "top",
      offset: [0, -10],
      className: "restaurant-map-tooltip",
    });

    ghost.on("dblclick", () => handlers.current.router.push(href));

    ghostRef.current = ghost;
    map.flyTo([place.lat, place.lng], 16, { duration: 0.8 });
  }, [place]);
  // 5. 화면 잡기 — 장소를 고른 동안에는 건드리지 않습니다.
  const lastFit = useRef("");

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || place) return;

    if (selectedId !== null) {
      const target = placed(rows).find((r) => r.id === selectedId);
      if (target) map.flyTo([target.lat, target.lng], 15, { duration: 0.7 });
      return;
    }

    const visible = placed(rows);
    if (!visible.length) return;

    const key = visible.map((r) => r.id).join(",");
    if (key === lastFit.current) return;
    lastFit.current = key;

    if (visible.length === 1) {
      map.setView([visible[0].lat, visible[0].lng], 15);
      return;
    }

    map.fitBounds(
      L.latLngBounds(visible.map((r) => [r.lat, r.lng] as [number, number])),
      { paddingTopLeft: [40, 120], paddingBottomRight: [40, 40], maxZoom: 15 }
    );
  }, [rows, selectedId, place]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

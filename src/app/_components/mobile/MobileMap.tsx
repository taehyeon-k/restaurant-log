"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { Place } from "@/lib/places";
import { pinColor } from "@/lib/types";

export type Placed = Place & { lat: number; lng: number };

export const placed = (places: Place[]) =>
  places.filter((p): p is Placed => p.lat !== null && p.lng !== null);

export type MapHandle = {
  /** 한 곳으로 날아갑니다 */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** 여러 곳이 한 화면에 들어오게 맞춥니다 */
  fitTo: (points: [number, number][]) => void;
  /** 시트 높이가 바뀐 뒤 크기를 다시 잽니다 */
  invalidate: () => void;
};

/**
 * 물방울 핀 — 데스크톱 mapPin.ts 와 같은 모양, 모바일 크기(23 / 선택 30).
 * 모바일에서는 상시 이름표를 달지 않습니다 (지도를 가립니다).
 */
function pinHtml(row: Place, active: boolean) {
  const base = pinColor(row.category);
  const fill = row.revisit ? base : "#fbfaf6";
  const stroke = row.revisit ? "#fbfaf6" : base;
  const core = row.revisit ? "#fbfaf6" : base;
  const size = active ? 30 : 23;
  const dot = active ? 10 : 8;

  return (
    '<div style="position:absolute; left:50%; bottom:8px; transform:translateX(-50%);' +
    ' display:flex; flex-direction:column; align-items:center; gap:2px">' +
    `<div style="width:${size}px; height:${size}px; box-sizing:border-box;` +
    ` border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:${fill};` +
    ` border:${active ? 2 : 1.5}px solid ${stroke};` +
    ' box-shadow:1px -1px 5px rgba(28,26,23,.18); display:flex; align-items:center;' +
    ' justify-content:center">' +
    `<div style="width:${dot}px; height:${dot}px; border-radius:50%; background:${core};` +
    ' transform:rotate(45deg)"></div></div>' +
    '<div style="width:9px; height:3px; border-radius:50%; background:rgba(28,26,23,.16)"></div>' +
    "</div>"
  );
}

const MobileMap = forwardRef<
  MapHandle,
  {
    places: Place[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
    /** 수정 중이거나 인증 흐름 중 — 지도를 건드리지 않습니다 */
    frozen: boolean;
  }
>(function MobileMap({ places, selectedKey, onSelect, frozen }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const activeState = useRef(new Map<string, boolean>());
  const readyRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);
  const lastFit = useRef("");

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom = 15) => {
      lastFit.current = `fly:${lat},${lng}`;
      mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.7 });
    },
    fitTo: (points) => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map || !points.length) return;
      lastFit.current = `fit:${points.length}:${points[0].join(",")}`;
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [36, 120],
        paddingBottomRight: [36, 40],
        maxZoom: 15,
      });
    },
    invalidate: () => mapRef.current?.invalidateSize(),
  }));

  // 1. 지도 생성 — 마운트 시 한 번만.
  useEffect(() => {
    if (!containerRef.current) return;

    const markerStore = markers.current;
    const activeStore = activeState.current;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        keyboard: false,
      }).setView([37.5605, 126.982], 12);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
        className: "paper-tiles",
      }).addTo(map);

      leafletRef.current = L;
      mapRef.current = map;
      readyRef.current = true;
      syncRef.current?.();

      // 첫 화면 맞추기는 컨테이너 크기를 잰 뒤에 다시 합니다 —
      // 크기를 모른 채 fitBounds 를 하면 엉뚱한 데를 비춥니다.
      setTimeout(() => {
        if (cancelled) return;
        map.invalidateSize();
        lastFit.current = "";
        syncRef.current?.();
      }, 80);
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      markerStore.clear();
      activeStore.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. 마커 붙이고 떼기 + 결과가 바뀔 때만 화면 맞추기.
  useEffect(() => {
    const sync = () => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      const visible = placed(places);
      const next = new Set(visible.map((p) => p.key));

      for (const [key, marker] of markers.current) {
        if (!next.has(key)) {
          marker.remove();
          markers.current.delete(key);
          activeState.current.delete(key);
        }
      }

      for (const p of visible) {
        const active = selectedKey === p.key;
        let marker = markers.current.get(p.key);

        if (!marker) {
          marker = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              className: "restaurant-map-pin",
              iconSize: [44, 44],
              iconAnchor: [22, 38],
              html: pinHtml(p, active),
            }),
          }).addTo(map);
          marker.on("click", () => onSelectRef.current(p.key));
          markers.current.set(p.key, marker);
          activeState.current.set(p.key, active);
          continue;
        }

        marker.setLatLng([p.lat, p.lng]);
        if (activeState.current.get(p.key) !== active) {
          marker.setIcon(
            L.divIcon({
              className: "restaurant-map-pin",
              iconSize: [44, 44],
              iconAnchor: [22, 38],
              html: pinHtml(p, active),
            })
          );
          activeState.current.set(p.key, active);
        }
      }

      if (frozen || !visible.length) return;

      const key = visible.map((p) => p.key).join(",");
      if (key === lastFit.current) return;
      lastFit.current = key;

      if (visible.length === 1) {
        map.setView([visible[0].lat, visible[0].lng], 15);
        return;
      }

      map.fitBounds(
        L.latLngBounds(visible.map((p) => [p.lat, p.lng] as [number, number])),
        {
          paddingTopLeft: [36, 120],
          paddingBottomRight: [36, 40],
          maxZoom: 15,
        }
      );
    };

    syncRef.current = sync;
    if (readyRef.current) sync();
  }, [places, selectedKey, frozen]);

  return <div ref={containerRef} className="absolute inset-x-0 top-0 h-[620px]" />;
});

export default MobileMap;

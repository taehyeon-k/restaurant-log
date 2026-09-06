"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Place } from "@/lib/places";
import { pinColor } from "@/lib/types";
import { loadNaverMaps } from "@/lib/loadNaverMaps";

export type Placed = Place & { lat: number; lng: number };
export const placed = (places: Place[]) => places.filter((p): p is Placed => p.lat !== null && p.lng !== null);

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitTo: (points: [number, number][]) => void;
  invalidate: () => void;
};

function pinHtml(row: Place, active: boolean) {
  const base = pinColor(row.category);
  const fill = row.revisit ? base : "#fbfaf6";
  const stroke = row.revisit ? "#fbfaf6" : base;
  const core = row.revisit ? "#fbfaf6" : base;
  const size = active ? 30 : 23;
  const dot = active ? 10 : 8;
  return '<div data-pin style="position:absolute;left:50%;bottom:8px;width:' + size + 'px;height:' + size + 'px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);border-radius:50% 50% 50% 0;background:' + fill + ';border:' + (active ? 2 : 1.5) + 'px solid ' + stroke + ';box-shadow:1px -1px 5px rgba(28,26,23,.18);display:flex;align-items:center;justify-content:center"><div style="width:' + dot + 'px;height:' + dot + 'px;border-radius:50%;background:' + core + ';transform:rotate(45deg)"></div></div><div style="position:absolute;left:50%;bottom:4px;width:9px;height:3px;transform:translateX(-50%);border-radius:50%;background:rgba(28,26,23,.16)"></div>';
}

const MobileMap = forwardRef<MapHandle, {
  places: Place[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  frozen: boolean;
}>(function MobileMap({ places, selectedKey, onSelect, frozen }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markers = useRef(new Map<string, naver.maps.Marker>());
  const readyRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);
  const lastFit = useRef("");
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom = 15) => {
      lastFit.current = "fly:" + lat + "," + lng;
      const map = mapRef.current;
      if (map) map.morph(new naver.maps.LatLng(lat, lng), zoom, { duration: 700 });
    },
    fitTo: (points) => {
      const map = mapRef.current;
      if (!map || !points.length) return;
      lastFit.current = "fit:" + points.length + ":" + points[0].join(",");
      const bounds = new naver.maps.LatLngBounds(new naver.maps.LatLng(points[0][0], points[0][1]), new naver.maps.LatLng(points[0][0], points[0][1]));
      for (const point of points.slice(1)) bounds.extend(new naver.maps.LatLng(point[0], point[1]));
      map.fitBounds(bounds, { top: 120, right: 40, bottom: 40, left: 36, maxZoom: 15 });
    },
    invalidate: () => mapRef.current?.autoResize(),
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadNaverMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      mapRef.current = new naver.maps.Map(containerRef.current, {
        center: new naver.maps.LatLng(37.5605, 126.982), zoom: 12,
        keyboardShortcuts: false, zoomControl: true,
        zoomControlOptions: { position: naver.maps.Position.BOTTOM_RIGHT },
      });
      readyRef.current = true;
      syncRef.current?.();
      window.setTimeout(() => { if (!cancelled) { mapRef.current?.autoResize(); lastFit.current = ""; syncRef.current?.(); } }, 80);
    }).catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
      for (const marker of markers.current.values()) marker.setMap(null);
      markers.current.clear();
      readyRef.current = false;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const map = mapRef.current;
      if (!map) return;
      const visible = placed(places);
      const next = new Set(visible.map((p) => p.key));
      for (const [key, marker] of markers.current) {
        if (!next.has(key)) { marker.setMap(null); markers.current.delete(key); }
      }
      for (const p of visible) {
        const active = selectedKey === p.key;
        let marker = markers.current.get(p.key);
        const icon: naver.maps.HtmlIcon = { content: '<div class="restaurant-map-pin" style="position:relative;width:44px;height:44px">' + pinHtml(p, active) + "</div>", size: new naver.maps.Size(44, 44), anchor: new naver.maps.Point(22, 38) };
        if (!marker) {
          marker = new naver.maps.Marker({ position: new naver.maps.LatLng(p.lat, p.lng), map, icon, clickable: true });
          naver.maps.Event.addListener(marker, "click", () => onSelectRef.current(p.key));
          markers.current.set(p.key, marker);
        } else {
          marker.setPosition(new naver.maps.LatLng(p.lat, p.lng));
          marker.setIcon(icon);
        }
        marker.setZIndex(active ? 1000 : 0);
      }
      if (frozen || !visible.length) return;
      const key = visible.map((p) => p.key).join(",");
      if (key === lastFit.current) return;
      lastFit.current = key;
      if (visible.length === 1) { map.morph(new naver.maps.LatLng(visible[0].lat, visible[0].lng), 15, { duration: 500 }); return; }
      const bounds = new naver.maps.LatLngBounds(new naver.maps.LatLng(visible[0].lat, visible[0].lng), new naver.maps.LatLng(visible[0].lat, visible[0].lng));
      for (const p of visible.slice(1)) bounds.extend(new naver.maps.LatLng(p.lat, p.lng));
      map.fitBounds(bounds, { top: 120, right: 40, bottom: 40, left: 36, maxZoom: 15 });
    };
    syncRef.current = sync;
    if (readyRef.current) sync();
  }, [places, selectedKey, frozen]);

  return <div ref={containerRef} className="absolute inset-x-0 top-0 h-[620px] w-full" />;
});

export default MobileMap;

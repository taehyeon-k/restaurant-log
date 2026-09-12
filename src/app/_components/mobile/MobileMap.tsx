"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Place } from "@/lib/places";
import { matchWish, pinColor, type Wish } from "@/lib/types";
import { loadNaverMaps } from "@/lib/loadNaverMaps";
import { BOOKMARK_PATH, ghostIcon, LABEL_ZOOM, labelHtml, setLabelVisible, wishPinIcon } from "../mapPin";

export type MarkerFilter = "all" | "visited" | "wish";

export type Placed = Place & { lat: number; lng: number };
export const placed = (places: Place[]) => places.filter((p): p is Placed => p.lat !== null && p.lng !== null);

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitTo: (points: [number, number][]) => void;
  invalidate: () => void;
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 기록이 있는 곳을 또 갈 예정으로 담았을 때 붙는 책갈피 배지(HANDOFF-map-badge.md §1).
 * 한 자리에 핀 하나 — 물방울 오른쪽 위 모서리에 얹습니다. 자리는 물방울 크기(size)에 따라 달라집니다.
 */
function badgeHtml(size: number) {
  return (
    '<div style="position:absolute;left:50%;bottom:' + (8 + size - 8) + 'px;margin-left:' + (size / 2 - 5) + 'px;width:15px;height:15px;border-radius:50%;background:#fbfaf6;box-shadow:0 1px 3px rgba(28,26,23,.28);display:flex;align-items:center;justify-content:center">' +
    '<svg width="9" height="9" viewBox="0 0 24 24" fill="#b4552d"><path d="' + BOOKMARK_PATH + '"/></svg>' +
    "</div>"
  );
}

function pinHtml(row: Place, active: boolean, planned: boolean) {
  const base = pinColor(row.category);
  const fill = row.revisit ? base : "#fbfaf6";
  const stroke = row.revisit ? "#fbfaf6" : base;
  const core = row.revisit ? "#fbfaf6" : base;
  const size = active ? 30 : 23;
  const dot = active ? 10 : 8;
  return (
    '<div data-pin style="position:absolute;left:50%;bottom:8px;width:' + size + 'px;height:' + size + 'px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);border-radius:50% 50% 50% 0;background:' + fill + ';border:' + (active ? 2 : 1.5) + 'px solid ' + stroke + ';box-shadow:1px -1px 5px rgba(28,26,23,.18);display:flex;align-items:center;justify-content:center"><div style="width:' + dot + 'px;height:' + dot + 'px;border-radius:50%;background:' + core + ';transform:rotate(45deg)"></div></div><div style="position:absolute;left:50%;bottom:4px;width:9px;height:3px;transform:translateX(-50%);border-radius:50%;background:rgba(28,26,23,.16)"></div>' +
    (planned ? badgeHtml(size) : "")
  );
}

export type Ghost = { name: string; lat: number; lng: number } | null;

const MobileMap = forwardRef<MapHandle, {
  places: Place[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  frozen: boolean;
  /** 검색으로 고른, 아직 기록에는 없는 자리 — 지도에 흐린 핀으로만 보여줍니다. */
  ghost?: Ghost;
  onGhostClick?: () => void;
  /** 가고싶다 — 책갈피 마커로 따로 그립니다(§5). */
  wishes?: Wish[];
  markerFilter?: MarkerFilter;
  onSelectWish?: (id: string) => void;
}>(function MobileMap(
  { places, selectedKey, onSelect, frozen, ghost = null, onGhostClick, wishes = [], markerFilter = "all", onSelectWish },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markers = useRef(new Map<string, naver.maps.Marker>());
  const wishMarkers = useRef(new Map<string, naver.maps.Marker>());
  const ghostRef = useRef<naver.maps.Marker | null>(null);
  const readyRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);
  const syncWishRef = useRef<(() => void) | null>(null);
  const lastFit = useRef("");
  const onSelectRef = useRef(onSelect);
  const onGhostClickRef = useRef(onGhostClick);
  const onSelectWishRef = useRef(onSelectWish);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onGhostClickRef.current = onGhostClick; }, [onGhostClick]);
  useEffect(() => { onSelectWishRef.current = onSelectWish; }, [onSelectWish]);

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
      naver.maps.Event.addListener(mapRef.current, "zoom_changed", () => {
        const map = mapRef.current;
        if (!map) return;
        const visible = map.getZoom() >= LABEL_ZOOM;
        for (const marker of markers.current.values()) setLabelVisible(marker, visible);
        for (const marker of wishMarkers.current.values()) setLabelVisible(marker, visible);
      });
      syncRef.current?.();
      syncWishRef.current?.();
      window.setTimeout(() => {
        if (!cancelled) {
          mapRef.current?.autoResize();
          lastFit.current = "";
          syncRef.current?.();
          syncWishRef.current?.();
        }
      }, 80);
    }).catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
      for (const marker of markers.current.values()) marker.setMap(null);
      markers.current.clear();
      for (const marker of wishMarkers.current.values()) marker.setMap(null);
      wishMarkers.current.clear();
      ghostRef.current?.setMap(null);
      ghostRef.current = null;
      readyRef.current = false;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const maps = naver.maps;
    ghostRef.current?.setMap(null);
    ghostRef.current = null;
    if (!ghost) return;
    const marker = new maps.Marker({
      position: new maps.LatLng(ghost.lat, ghost.lng),
      map,
      icon: ghostIcon(maps, { name: ghost.name, cta: "+ 여기에 기록 추가" }),
      zIndex: 1200,
      clickable: true,
    });
    maps.Event.addListener(marker, "click", () => onGhostClickRef.current?.());
    ghostRef.current = marker;
    map.morph(new maps.LatLng(ghost.lat, ghost.lng), 16, { duration: 700 });
  }, [ghost]);

  useEffect(() => {
    const sync = () => {
      const map = mapRef.current;
      if (!map) return;
      // 「가고싶다만」에서도 기록+위시가 겹치는 곳은 배지 붙은 물방울로 남깁니다 — 그렇지 않으면
      // 위시 마커가 걸러지고(§1) 기록 핀도 숨어 그 자리가 통째로 사라집니다.
      const visible =
        markerFilter === "wish" ? placed(places).filter((p) => matchWish(wishes, p.name) != null) : placed(places);
      const next = new Set(visible.map((p) => p.key));
      for (const [key, marker] of markers.current) {
        if (!next.has(key)) { marker.setMap(null); markers.current.delete(key); }
      }
      for (const p of visible) {
        const active = selectedKey === p.key;
        const planned = matchWish(wishes, p.name) != null;
        let marker = markers.current.get(p.key);
        const content = '<div class="restaurant-map-pin" style="position:relative;width:44px;height:44px">' + labelHtml(p.name, p.rating) + pinHtml(p, active, planned) + "</div>";
        const icon: naver.maps.HtmlIcon = { content, size: new naver.maps.Size(44, 44), anchor: new naver.maps.Point(22, 38) };
        if (!marker) {
          marker = new naver.maps.Marker({ position: new naver.maps.LatLng(p.lat, p.lng), map, icon, clickable: true });
          naver.maps.Event.addListener(marker, "click", () => onSelectRef.current(p.key));
          markers.current.set(p.key, marker);
        } else {
          marker.setPosition(new naver.maps.LatLng(p.lat, p.lng));
          marker.setIcon(icon);
        }
        setLabelVisible(marker, map.getZoom() >= LABEL_ZOOM);
        marker.setZIndex(active ? 1000 : 0);
      }
      // 범위 맞추기는 목록(검색·필터) 결과 기준입니다 — 마커 필터(모두/기록만/위시만)를
      // 눌렀다고 그 순간 지도가 다른 곳으로 튀면 안 됩니다.
      const all = placed(places);
      if (frozen || !all.length) return;
      const key = all.map((p) => p.key).join(",");
      if (key === lastFit.current) return;
      lastFit.current = key;
      if (all.length === 1) { map.morph(new naver.maps.LatLng(all[0].lat, all[0].lng), 15, { duration: 500 }); return; }
      const bounds = new naver.maps.LatLngBounds(new naver.maps.LatLng(all[0].lat, all[0].lng), new naver.maps.LatLng(all[0].lat, all[0].lng));
      for (const p of all.slice(1)) bounds.extend(new naver.maps.LatLng(p.lat, p.lng));
      map.fitBounds(bounds, { top: 120, right: 40, bottom: 40, left: 36, maxZoom: 15 });
    };
    syncRef.current = sync;
    if (readyRef.current) sync();
  }, [places, selectedKey, frozen, markerFilter, wishes]);

  /**
   * 위시 책갈피 마커 — 기록 핀과 같은 diff-and-update 방식이지만 별도 레이어입니다.
   * 기록이 있는 곳은 배지로 이미 표시되므로, 이름이 같은 기록이 있는 위시는 겹치지 않게 걸러냅니다(§1).
   */
  useEffect(() => {
    const sync = () => {
      const map = mapRef.current;
      if (!map) return;
      const recordNames = new Set(places.map((p) => norm(p.name)));
      const visible =
        markerFilter === "visited"
          ? []
          : wishes.filter((w) => w.lat != null && w.lng != null && !recordNames.has(norm(w.name)));
      const next = new Set(visible.map((w) => w.id));
      for (const [id, marker] of wishMarkers.current) {
        if (!next.has(id)) { marker.setMap(null); wishMarkers.current.delete(id); }
      }
      for (const w of visible) {
        const lat = w.lat as number;
        const lng = w.lng as number;
        let marker = wishMarkers.current.get(w.id);
        const icon = wishPinIcon(naver.maps, { category: w.category }, { name: w.name });
        if (!marker) {
          marker = new naver.maps.Marker({ position: new naver.maps.LatLng(lat, lng), map, icon, clickable: true, zIndex: 500 });
          naver.maps.Event.addListener(marker, "click", () => onSelectWishRef.current?.(w.id));
          wishMarkers.current.set(w.id, marker);
        } else {
          marker.setPosition(new naver.maps.LatLng(lat, lng));
          marker.setIcon(icon);
        }
        setLabelVisible(marker, map.getZoom() >= LABEL_ZOOM);
      }
    };
    syncWishRef.current = sync;
    if (readyRef.current) sync();
  }, [wishes, markerFilter, places]);

  return <div ref={containerRef} className="naver-map-tone absolute inset-x-0 top-0 h-[620px] w-full" />;
});

export default MobileMap;

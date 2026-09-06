"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Place } from "@/lib/places";
import { useSearchState } from "@/lib/useSearchState";
import { loadNaverMaps } from "@/lib/loadNaverMaps";
import { applyActive, ghostIcon, pinIcon, setLabelVisible } from "./mapPin";
import { useHover, usePlace } from "./Workspace";

type Placed = Place & { lat: number; lng: number };
const LABEL_ZOOM = 15;
const placed = (places: Place[]) => places.filter((r): r is Placed => r.lat !== null && r.lng !== null);

export default function MapPane({ places, selectedKey }: { places: Place[]; selectedKey: string | null }) {
  const router = useRouter();
  const { hover, setHover } = useHover();
  const { place } = usePlace();
  const { set } = useSearchState();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRefs = useRef<Map<string, naver.maps.Marker>>(new Map());
  const ghostRef = useRef<naver.maps.Marker | null>(null);
  const readyRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);
  const handlers = useRef({ router, setHover });
  handlers.current = { router, setHover };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    loadNaverMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const maps = naver.maps;
      const map = new maps.Map(containerRef.current, {
        center: new maps.LatLng(37.5665, 126.978),
        zoom: 12,
        keyboardShortcuts: false,
        zoomControl: true,
        zoomControlOptions: { position: maps.Position.BOTTOM_RIGHT },
      });
      mapRef.current = map;
      readyRef.current = true;
      maps.Event.addListener(map, "zoom_changed", () => {
        const visible = map.getZoom() >= LABEL_ZOOM;
        for (const marker of markerRefs.current.values()) setLabelVisible(marker, visible);
      });
      syncRef.current?.();
    }).catch((error: unknown) => console.error(error));

    return () => {
      cancelled = true;
      for (const marker of markerRefs.current.values()) marker.setMap(null);
      markerRefs.current.clear();
      ghostRef.current?.setMap(null);
      ghostRef.current = null;
      readyRef.current = false;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const map = mapRef.current;
      if (!map) return;
      const maps = naver.maps;
      const visible = placed(places);
      const next = new Set(visible.map((r) => r.key));
      for (const [key, marker] of markerRefs.current) {
        if (!next.has(key)) { marker.setMap(null); markerRefs.current.delete(key); }
      }
      for (const r of visible) {
        const active = hover === r.key || selectedKey === r.key;
        const existing = markerRefs.current.get(r.key);
        const icon = pinIcon(maps, r.latest, { name: r.name, rating: r.rating });
        if (existing) {
          existing.setPosition(new maps.LatLng(r.lat, r.lng));
          existing.setIcon(icon);
          applyActive(existing, active);
          setLabelVisible(existing, map.getZoom() >= LABEL_ZOOM);
          continue;
        }
        const marker = new maps.Marker({
          position: new maps.LatLng(r.lat, r.lng),
          map,
          icon,
          clickable: true,
        });
        maps.Event.addListener(marker, "click", () => handlers.current.router.push(
          r.visits.length === 1 ? "/?rid=" + r.visits[0].id : "/?place=" + encodeURIComponent(r.key),
          { scroll: false },
        ));
        maps.Event.addListener(marker, "mouseover", () => handlers.current.setHover(r.key));
        maps.Event.addListener(marker, "mouseout", () => handlers.current.setHover(null));
        markerRefs.current.set(r.key, marker);
        applyActive(marker, active);
        setLabelVisible(marker, map.getZoom() >= LABEL_ZOOM);
      }
    };
    syncRef.current = sync;
    if (readyRef.current) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  useEffect(() => {
    for (const [key, marker] of markerRefs.current) {
      applyActive(marker, hover === key || selectedKey === key);
    }
  }, [hover, selectedKey, places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const maps = naver.maps;
    ghostRef.current?.setMap(null);
    ghostRef.current = null;
    if (!place) return;
    const href = "/add?" + new URLSearchParams({
      name: place.name, address: place.address, lat: String(place.lat), lng: String(place.lng),
    }).toString();
    const marker = new maps.Marker({
      position: new maps.LatLng(place.lat, place.lng),
      map,
      icon: ghostIcon(maps, { name: place.name, cta: "+ 여기에 기록 추가" }),
      zIndex: 1200,
      clickable: true,
    });
    maps.Event.addListener(marker, "click", () => handlers.current.router.push(href));
    ghostRef.current = marker;
    map.morph(new maps.LatLng(place.lat, place.lng), 16, { duration: 800 });
  }, [place]);

  const lastFit = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || place) return;
    const maps = naver.maps;
    if (selectedKey !== null) {
      const target = placed(places).find((r) => r.key === selectedKey);
      if (target) map.morph(new maps.LatLng(target.lat, target.lng), 15, { duration: 700 });
      return;
    }
    const visible = placed(places);
    if (!visible.length) return;
    const key = visible.map((r) => r.key).join(",");
    if (key === lastFit.current) return;
    lastFit.current = key;
    if (visible.length === 1) {
      map.morph(new maps.LatLng(visible[0].lat, visible[0].lng), 15, { duration: 500 });
      return;
    }
    const bounds = new maps.LatLngBounds(new maps.LatLng(visible[0].lat, visible[0].lng), new maps.LatLng(visible[0].lat, visible[0].lng));
    for (const r of visible.slice(1)) bounds.extend(new maps.LatLng(r.lat, r.lng));
    map.fitBounds(bounds, { top: 120, right: 40, bottom: 40, left: 40, maxZoom: 15 });
  }, [places, selectedKey, place]);

  const searchHere = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds() as naver.maps.LatLngBounds;
    set("bbox", [bounds.south(), bounds.west(), bounds.north(), bounds.east()].map((n) => n.toFixed(5)).join(","));
  };

  return <>
    <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    <button onClick={searchHere} className="absolute top-27 left-8 z-[1000] flex cursor-pointer items-center gap-1.75 rounded-[20px] border border-line bg-card px-3.75 py-2 text-[12px] whitespace-nowrap text-[#4a453d] shadow-[0_4px_12px_rgba(28,26,23,0.07)] hover:border-brick hover:text-brick">
      이 지역에서 다시 검색
    </button>
  </>;
}

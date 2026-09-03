"use client";

import { useEffect, useRef } from "react";
import { useSearchState } from "@/lib/useSearchState";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { Place } from "@/lib/places";
import { pinIcon, ghostIcon, applyActive } from "./mapPin";
import { useHover, usePlace } from "./Workspace";

type Placed = Place & { lat: number; lng: number };

const placed = (places: Place[]) =>
  places.filter((r): r is Placed => r.lat !== null && r.lng !== null);

export default function MapPane({
  places,
  selectedKey,
}: {
  places: Place[];
  selectedKey: string | null;
}) {
  const router = useRouter();
  const { hover, setHover } = useHover();
  const { place } = usePlace();
  const { set } = useSearchState();


  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerRefs = useRef<Map<string, Marker>>(new Map());
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

      const map = L.map(containerRef.current, {
  zoomControl: false,
  keyboard: false,
}).setView([37.5665, 126.978], 12);

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

       const visible = placed(places);
      const next = new Set(visible.map((r) => r.key));

      for (const [key, marker] of markerRefs.current) {
        if (!next.has(key)) {
          marker.remove();
          markerRefs.current.delete(key);
        }
      }

      for (const r of visible) {
        const active = hover === r.key || selectedKey === r.key;
        const existing = markerRefs.current.get(r.key);

        if (existing) {
          existing.setLatLng([r.lat, r.lng]);
          existing.setIcon(pinIcon(L, r.latest)); // 카테고리·재방문이 바뀌었을 수 있으니 다시 그립니다.
          applyActive(existing, active);
          continue;
        }

        const marker = L.marker([r.lat, r.lng], {
          icon: pinIcon(L, r.latest),
          riseOnHover: true,
        }).addTo(map);

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

        // 핀 아이콘이 tooltipAnchor 를 들고 있으므로 offset 은 0.
        marker.bindTooltip(label, {
          permanent: true,
          direction: "top",
          offset: [0, 0],
          className: "restaurant-map-tooltip",
        });

        marker.on("click", () =>
          handlers.current.router.push(
            r.visits.length === 1
              ? `/?rid=${r.visits[0].id}`
              : `/?place=${encodeURIComponent(r.key)}`,
            { scroll: false }
          )
        );
        marker.on("mouseover", () => handlers.current.setHover(r.key));
        marker.on("mouseout", () => handlers.current.setHover(null));

        applyActive(marker, active);
        markerRefs.current.set(r.key, marker);
      }
    };

    syncRef.current = sync;
    if (readyRef.current) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  // 3. 호버·선택은 크기만 키웁니다 — 아이콘을 갈아끼우지 않아 전환이 이어집니다.
  useEffect(() => {
    for (const [key, marker] of markerRefs.current) {
      const active = hover === key || selectedKey === key;
      applyActive(marker, active);
      marker.setZIndexOffset(active ? 1000 : 0);
    }
  }, [hover, selectedKey, places]);

  // 4. 지도 검색으로 고른 장소 — 라벨을 눌러 바로 기록 추가.
  const ghostRef = useRef<Marker | null>(null);

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

    const ghost = L.marker([place.lat, place.lng], {
      icon: ghostIcon(L),
      zIndexOffset: 1200,
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
      offset: [0, 0],
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

     if (selectedKey !== null) {
      const target = placed(places).find((r) => r.key === selectedKey);
      if (target) map.flyTo([target.lat, target.lng], 15, { duration: 0.7 });
      return;
    }

    const visible = placed(places);
    if (!visible.length) return;

    const key = visible.map((r) => r.key).join(",");
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
  }, [places, selectedKey, place]);

  const searchHere = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    set(
      "bbox",
      [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map((n) => n.toFixed(5))
        .join(",")
    );
  };

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <button
        onClick={searchHere}
        className="absolute top-27 left-8 z-[1000] flex cursor-pointer items-center gap-1.75 rounded-[20px] border border-line bg-card px-3.75 py-2 text-[12.5px] whitespace-nowrap text-[#4a453d] shadow-[0_4px_12px_rgba(28,26,23,0.07)] hover:border-brick hover:text-brick"
      >
        이 지역에서 다시 검색
      </button>
    </>
  );

}

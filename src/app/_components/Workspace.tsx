"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { Restaurant } from "@/lib/types";
import type { Place } from "@/lib/places";
import MapPane from "./MapPane";
import ResultList from "./ResultList";
import PlacePane from "./PlacePane";
import RecordPane from "./RecordPane";

const HoverContext = createContext<{
  hover: string | null;
  setHover: (key: string | null) => void;
}>({ hover: null, setHover: () => {} });

export const useHover = () => useContext(HoverContext);

/** 지도 검색창에서 고른 장소. 기록이 아니라 지도 위 임시 표시입니다. */
export type PickedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
} | null;

const PlaceContext = createContext<{
  place: PickedPlace;
  setPlace: (p: PickedPlace) => void;
}>({ place: null, setPlace: () => {} });

export const usePlace = () => useContext(PlaceContext);

export type MapView = { lat: number; lng: number; zoom: number };

/**
 * 지도의 최신 중심·확대값을 리렌더 없이 들고 있습니다 — "+ 기록 추가"를
 * 누른 순간의 값을 읽어 /add 로 넘기기 위한 것으로, 값 자체는 반응형일 필요가 없습니다.
 */
const MapViewRef = createContext<{ current: MapView | null }>({ current: null });

export const useMapViewRef = () => useContext(MapViewRef);

export default function Workspace({
  places,
  record,
  selectedPlace,
  selectedKey,
  mapOverlay,
  asideHeader,
}: {
  places: Place[];
  record: Restaurant | null;
  selectedPlace: Place | null;
  selectedKey: string | null;
  mapOverlay: React.ReactNode;
  asideHeader: React.ReactNode;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [place, setPlace] = useState<PickedPlace>(null);
  const mapViewRef = useRef<MapView | null>(null);

  return (
    <HoverContext.Provider value={{ hover, setHover }}>
      <PlaceContext.Provider value={{ place, setPlace }}>
        <MapViewRef.Provider value={mapViewRef}>
        <div className="relative flex-1 overflow-hidden bg-map">
          <MapPane places={places} selectedKey={selectedKey} />
          {mapOverlay}
        </div>

        <aside className="flex w-[560px] shrink-0 flex-col border-l border-line bg-paper">
          {asideHeader}

          {record ? (
            <RecordPane record={record} place={selectedPlace} />
          ) : selectedPlace ? (
            <PlacePane place={selectedPlace} />
          ) : (
            <ResultList places={places} />
          )}
        </aside>
        </MapViewRef.Provider>
      </PlaceContext.Provider>
    </HoverContext.Provider>
  );
}

"use client";

import { createContext, useContext, useState } from "react";
import type { Restaurant } from "@/lib/types";
import type { Place } from "@/lib/places";
import MapPane from "./MapPane";
import ResultList from "./ResultList";
import DetailPane from "./DetailPane";

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

export default function Workspace({
  places,
  selected,
  selectedKey,
  mapOverlay,
  asideHeader,
}: {
  places: Place[];
  selected: Restaurant | null;
  selectedKey: string | null;
  mapOverlay: React.ReactNode;
  asideHeader: React.ReactNode;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [place, setPlace] = useState<PickedPlace>(null);

  return (
    <HoverContext.Provider value={{ hover, setHover }}>
      <PlaceContext.Provider value={{ place, setPlace }}>
        <div className="relative flex-1 overflow-hidden bg-map">
          <MapPane places={places} selectedKey={selectedKey} />
          {mapOverlay}
        </div>

        <aside className="flex w-[560px] shrink-0 flex-col border-l border-line bg-paper">
          {asideHeader}
          {selected ? <DetailPane place={selected} /> : <ResultList places={places} />}
        </aside>
      </PlaceContext.Provider>
    </HoverContext.Provider>
  );
}

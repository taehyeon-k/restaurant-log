"use client";

import { createContext, useContext, useState } from "react";
import type { Restaurant } from "@/lib/types";
import MapPane from "./MapPane";
import ResultList from "./ResultList";
import DetailPane from "./DetailPane";

const HoverContext = createContext<{
  hover: number | null;
  setHover: (id: number | null) => void;
}>({ hover: null, setHover: () => {} });

export const useHover = () => useContext(HoverContext);

/**
 * Owns the one piece of state that isn't URL-worthy: which row/pin is hovered.
 * The map and the result list both read it, so they live under the same client
 * root. `mapOverlay` and `asideHeader` are server-rendered nodes passed through.
 */
export default function Workspace({
  rows,
  selected,
  q,
  mapOverlay,
  asideHeader,
}: {
  rows: Restaurant[];
  selected: Restaurant | null;
  q: string;
  mapOverlay: React.ReactNode;
  asideHeader: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <HoverContext.Provider value={{ hover, setHover }}>
      <div className="relative flex-1 overflow-hidden bg-map">
        <MapPane rows={rows} selectedId={selected?.id ?? null} q={q} />
        {mapOverlay}
      </div>

      <aside className="flex w-[560px] shrink-0 flex-col border-l border-line bg-paper">
        {asideHeader}
        {selected ? <DetailPane place={selected} /> : <ResultList rows={rows} />}
      </aside>
    </HoverContext.Provider>
  );
}

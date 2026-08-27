"use client";

import { useRouter } from "next/navigation";
import type { Restaurant } from "@/lib/types";
import { useHover } from "./Workspace";

/**
 * Placeholder map: a stylized Seoul plate with linearly projected pins.
 * Swap the backdrop for a Kakao/Naver map SDK — pin markup and the hover
 * link to the result list stay as they are.
 */
const BOUNDS = { west: 126.82, east: 127.13, south: 37.46, north: 37.62 };

const project = (r: Restaurant, i: number) => {
  if (r.lat == null || r.lng == null) {
    // Rows without coordinates still need a stable spot on the plate.
    return { x: 18 + ((i * 37) % 64), y: 22 + ((i * 53) % 56) };
  }
  return {
    x: ((r.lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100,
    y: ((BOUNDS.north - r.lat) / (BOUNDS.north - BOUNDS.south)) * 100,
  };
};

export default function MapPane({
  rows,
  selectedId,
}: {
  rows: Restaurant[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const { hover, setHover } = useHover();

  return (
    <>
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-map-grid) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute -left-[6%] top-[22%] h-11 w-[112%] -rotate-7 bg-map-road" />
      <div className="absolute -left-[6%] top-[64%] h-[30px] w-[112%] rotate-4 bg-map-road" />
      <div className="absolute left-[34%] -top-[10%] h-[120%] w-[34px] rotate-9 bg-map-road" />
      <div className="absolute left-[72%] -top-[10%] h-[120%] w-6 -rotate-5 bg-map-road" />
      <div className="absolute left-[8%] top-[74%] h-[22%] w-[30%] rounded-[14px] bg-map-park" />
      <div className="absolute left-[56%] top-[6%] h-[16%] w-[26%] rounded-[14px] bg-map-park" />

      {rows.map((r, i) => {
        const { x, y } = project(r, i);
        const active = hover === r.id || selectedId === r.id;
        return (
          <button
            key={r.id}
            onClick={() => router.push(`/?id=${r.id}`, { scroll: false })}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
            className={`absolute -translate-x-1/2 -translate-y-full cursor-pointer rounded-[14px_14px_14px_3px] border px-3.5 pt-2.25 pb-2 text-left transition-all ${
              active
                ? "z-30 border-brick bg-brick text-[#fdf9f3] shadow-[0_10px_24px_rgba(180,85,45,0.3)]"
                : `z-20 border-line bg-card shadow-[0_4px_12px_rgba(28,26,23,0.09)] ${
                    r.revisit ? "text-ink" : "text-faint"
                  }`
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="block text-[13px] font-medium whitespace-nowrap">
              {r.name}
            </span>
            <span className="block font-mono text-[11px] tracking-[0.06em] opacity-60">
              {r.rating?.toFixed(1) ?? "—"}
            </span>
          </button>
        );
      })}
    </>
  );
}

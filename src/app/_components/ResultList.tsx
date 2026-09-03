"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { shortDate, coverPhoto } from "@/lib/types";
import type { Place } from "@/lib/places";
import PriceLevel from "./PriceLevel";
import Stars from "./Stars";
import { useHover } from "./Workspace";

export default function ResultList({ places }: { places: Place[] }) {
  if (!places.length) {
    return (
      <div className="flex-1 px-8 pt-15 text-center text-sm leading-8 text-faint">
        조건에 맞는 기록이 없습니다.
        <br />
        <span className="text-[13px] text-[#a8a196]">
          필터를 줄이거나 검색어를 바꿔보세요.
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-8 pb-10">
      {places.map((place) => (
        <PlaceCard key={place.key} place={place} />
      ))}
    </div>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const { hover, setHover } = useHover();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

   const next = new URLSearchParams(params.toString());
  next.delete("id");
  if (place.visits.length === 1) next.set("rid", String(place.visits[0].id));
  else next.set("place", place.key);
  const href = `/?${next}`;

  const cover = coverPhoto(place.latest);
  const active = hover === place.key;

  return (
    <div
      onMouseEnter={() => setHover(place.key)}
      onMouseLeave={() => setHover(null)}
      className={`rounded-[4px] border p-4 transition-all ${
        active
          ? "border-[#cdc6b8] bg-card shadow-[0_6px_16px_rgba(28,26,23,0.07)]"
          : "border-line-soft bg-transparent"
      }`}
    >
      <Link href={href} scroll={false} className="block">
        <div className="flex items-start gap-4">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="size-21 shrink-0 border border-[#ded8cb] object-cover"
            />
          ) : (
            <div className="flex size-21 shrink-0 items-center justify-center border border-[#ded8cb] bg-[#eae5da] font-mono text-[10px] tracking-[0.1em] text-[#a8a196]">
              PHOTO
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-1.75">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="font-serif text-[19px] font-bold tracking-[-0.01em]">
                {place.name}
              </span>
              <span className="font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-[#a8a196]">
                {shortDate(place.latest.visited_at)}
              </span>
            </div>

            <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-[#4a453d]">
              <Stars rating={place.rating} size={13} />
              <span className="font-mono text-xs">
                {place.rating?.toFixed(1) ?? "—"}
              </span>
              <PriceLevel row={place} />
              <Divider />
              <span className="whitespace-nowrap">{place.category}</span>
              <Divider />
              <span
                className="whitespace-nowrap text-muted"
                style={
                  (place.region?.length ?? 0) >= 4
                    ? { fontSize: "11.5px", letterSpacing: "-0.02em" }
                    : undefined
                }
              >
                {place.region}
              </span>
            </div>

            <div className="truncate text-[13px] leading-relaxed text-muted">
              {[place.latest.menu, place.latest.review].filter(Boolean).join(" · ")}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {place.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-[14px] border border-[#ded8cb] px-2.5 py-1 text-[11px] text-muted"
                >
                  {k}
                </span>
              ))}
              {place.revisit && (
                <span className="rounded-[14px] border border-[#e2c9bb] bg-brick-soft px-2.5 py-1 text-[11px] text-brick">
                  재방문
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {place.visits.length > 1 && (
        <div className="flex flex-col">
          {open && (
            <div className="mt-3.5 flex flex-col gap-3.5 border-t border-line-soft px-0.5 pt-4">
              {place.visits.map((v) => (
                <Link
                  key={v.id}
                  href={`/?rid=${v.id}`}
                  scroll={false}
                  className="-mx-1.5 flex gap-3.5 rounded-[3px] px-1.5 py-1 transition-colors hover:bg-brick-soft"
                >
                  <span className="w-18 shrink-0 font-mono text-[11px] tracking-[0.06em] text-[#a8a196]">
                    {v.visited_at?.replaceAll("-", ".")}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.25">
                    <div className="flex items-center gap-2.25">
                      <Stars rating={v.rating} size={12} />
                      <span className="font-mono text-[11.5px] text-muted">
                        {v.rating?.toFixed(1) ?? "—"}
                      </span>
                      <span className="truncate text-[12px] text-faint">{v.menu}</span>
                    </div>
                    <div className="font-serif text-[13.5px] leading-[1.75] whitespace-pre-wrap text-[#4a453d]">
                      {v.review}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 border-t border-line-soft pt-2.25 text-[12px] text-faint hover:text-brick"
          >
            {open
              ? `기록 ${place.visits.length}개 접기`
              : `기록 ${place.visits.length}개 모두 보기`}
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M2.5 4.5L6 8L9.5 4.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

const Divider = () => <span className="h-2.75 w-px bg-line" />;

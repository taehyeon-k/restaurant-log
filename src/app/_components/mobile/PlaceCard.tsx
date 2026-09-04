"use client";

import type { Place } from "@/lib/places";
import { MobileStars, Pigs, VerifiedMark, photoFill } from "./ui";

/** 같은 이름의 방문 기록을 하나로 묶은 카드. */
export default function PlaceCard({
  place,
  onOpen,
}: {
  place: Place;
  onOpen: () => void;
}) {
  const summary =
    [place.latest.menu, place.latest.review].filter(Boolean).join(" · ") ||
    "기록을 아직 쓰지 않았습니다";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full cursor-pointer gap-3 rounded-[20px] border bg-card p-3 shadow-[0_3px_12px_rgba(28,26,23,.04)] ${
        place.verified ? "border-[#e0c3b1]" : "border-[#ded8cb]"
      }`}
    >
      <div
        className="relative grid size-[74px] shrink-0 place-items-center rounded-[15px]"
        style={photoFill(place.photo, place.category)}
      >
        {!place.photo && (
          <span className="font-mono text-[9px] tracking-[0.08em] text-[rgba(251,250,246,.9)]">
            {place.visits.length}장
          </span>
        )}
        {place.verified && (
          <span className="absolute -right-[3px] -bottom-[3px]">
            <VerifiedMark size={24} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-serif text-[16px] font-bold text-ink">
            {place.name}
          </span>
          {place.visits.length > 1 && (
            <span className="shrink-0 rounded-[9px] bg-[#efe9dc] px-[7px] py-0.5 font-mono text-[9px] whitespace-nowrap text-muted">
              기록 {place.visits.length}
            </span>
          )}
          {place.revisit && (
            <span className="shrink-0 rounded-[9px] bg-brick-soft px-[7px] py-0.5 text-[9.5px] whitespace-nowrap text-brick">
              재방문
            </span>
          )}
        </div>

        <div className="mt-1 text-[11px] text-faint">
          {[place.category, place.region].filter(Boolean).join(" · ")}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <MobileStars rating={place.rating} size={12.5} />
          <span className="font-mono text-[10.5px] text-muted">
            {place.rating?.toFixed(1) ?? "—"}
          </span>
          <span className="h-[11px] w-px bg-[#ded8cb]" />
          <Pigs row={place} />
        </div>

        <div className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.5] text-[#4d4842]">
          {summary}
        </div>
      </div>
    </button>
  );
}

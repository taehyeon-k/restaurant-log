"use client";

import type { Place } from "@/lib/places";
import { dottedDate } from "@/lib/types";
import { feltLabel, feltLevel } from "@/lib/price";
import { photoCount } from "./record";
import { Eyebrow, MobileStars, Pigs, photoFill } from "./ui";
import { SAFE_TOP } from "./MobileShell";

/** 기록이 두 개 이상인 가게 화면. */
export default function PlaceScreen({
  place,
  onBack,
  onOpenVisit,
}: {
  place: Place;
  onBack: () => void;
  onOpenVisit: (id: number) => void;
}) {
  return (
    <div className="absolute inset-0 z-[1200] flex flex-col bg-paper">
      <div
        className="relative h-[210px] shrink-0"
        style={photoFill(place.photo, place.category)}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="absolute left-4 grid size-11 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.92)] text-[17px] text-ink"
          style={{ top: SAFE_TOP }}
        >
          ←
        </button>

        {!place.photo && (
          <div className="absolute bottom-[18px] left-5 font-mono text-[9.5px] tracking-[0.14em] text-[rgba(251,250,246,.85)]">
            {place.category} · {place.visits.length}번 방문
          </div>
        )}
      </div>

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-[22px] pt-[22px] pb-10">
        <Eyebrow>NO. {String(place.latest.id).padStart(3, "0")}</Eyebrow>

        <h1 className="mt-[9px] font-serif text-[27px] font-bold tracking-[-0.01em]">
          {place.name}
        </h1>

        <div className="mt-2 flex items-center gap-2 text-[12px] text-faint">
          <span>{place.category}</span>
          {place.region && (
            <>
              <span>·</span>
              <span>{place.region}</span>
            </>
          )}
        </div>

        {place.address && (
          <div className="mt-1.5 text-[11.5px] text-[#a29a8c]">{place.address}</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <MobileStars rating={place.rating} size={15} gap={1.5} />
          <span className="font-mono text-[12px] text-muted">
            {place.rating?.toFixed(1) ?? "—"}
          </span>
          <span className="h-[13px] w-px bg-[#ded8cb]" />
          <Pigs row={place} w={18} h={17} />
          <span className="text-[11.5px] text-faint">
            {feltLabel(feltLevel(place))}
          </span>
        </div>

        {place.keywords.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {place.keywords.map((k) => (
              <span
                key={k}
                className="rounded-[14px] border border-[#e2dccf] px-2.5 py-1 text-[11px] text-muted"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        <div className="mt-[26px] flex items-center justify-between border-t border-[#ded8cb] pt-[18px]">
          <Eyebrow>RECORDS</Eyebrow>
          <span className="text-[11.5px] text-faint">
            기록 {place.visits.length}개
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-[9px]">
          {place.visits.map((v) => {
            const shots = photoCount(v);

            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onOpenVisit(v.id)}
                className={`w-full cursor-pointer rounded-[18px] border bg-card px-[15px] py-[13px] text-left ${
                  v.verified ? "border-[#e0c3b1]" : "border-[#e2dccf]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-ink">
                    {dottedDate(v.visited_at)}
                  </span>
                  <span className="flex items-center gap-[7px]">
                    <MobileStars rating={v.rating} size={11.5} />
                    <span className="font-mono text-[10.5px] text-muted">
                      {v.rating?.toFixed(1) ?? "—"}
                    </span>
                  </span>
                </div>

                <div className="mt-[7px] text-[11.5px] text-muted">
                  {v.menu || "메뉴를 쓰지 않았습니다"}
                </div>

                <div className="mt-[5px] line-clamp-2 text-[11.5px] leading-[1.55] text-[#4d4842]">
                  {v.review || "메모가 비어 있습니다"}
                </div>

                <div className="mt-[9px] flex items-center gap-2 font-mono text-[9.5px] text-[#a29a8c]">
                  {shots ? (
                    <>
                      <span>{shots}장</span>
                      <span>·</span>
                      <span>
                        PHOTO {Math.min(v.cover_index ?? 0, shots - 1) + 1}
                      </span>
                    </>
                  ) : (
                    <span>사진 없음</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

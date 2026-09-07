"use client";

import { useMemo } from "react";
import { coverPhoto, dottedDate, verifiedTime, type Restaurant } from "@/lib/types";
import { MobileStars, VerifiedMark, photoFill } from "./ui";

/** "2026-08-09" → { month: 8, day: 9 } (앞자리 0 없이) */
function titleParts(dateKey: string) {
  const [, m, d] = dateKey.split("-").map(Number);
  return { month: m, day: d };
}

/**
 * 그날 화면 — 월력 칸을 누르면 열립니다. 그 날짜에 방문한 기록을 카드로 모아 보여줍니다.
 * HANDOFF-calendar.md 2절.
 */
export default function DayScreen({
  dateKey,
  rows,
  onBack,
  onOpenRecord,
}: {
  dateKey: string;
  rows: Restaurant[];
  onBack: () => void;
  onOpenRecord: (record: Restaurant) => void;
}) {
  const visits = useMemo(
    () =>
      rows
        .filter((r) => r.visited_at === dateKey)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [rows, dateKey]
  );

  const { month, day } = titleParts(dateKey);

  return (
    <div className="absolute inset-0 z-[1190] flex flex-col bg-paper">
      <div
        className="shrink-0 border-b border-[#e6e0d3]"
        style={{ padding: "44px 20px 16px" }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="-ml-[10px] grid size-11 cursor-pointer place-items-center rounded-full border-none bg-transparent text-[17px] text-ink hover:bg-[#eee9de]"
        >
          ←
        </button>

        <div className="mt-2 font-mono text-[10px] tracking-[0.18em] text-faint">
          {dottedDate(dateKey)}
        </div>
        <h1 className="mt-1 font-serif text-[26px] font-bold tracking-[-0.01em]">
          {month}월 {day}일 방문한 식당
        </h1>
        <div className="mt-1 text-[12px] text-[#a29a8c]">기록 {visits.length}건</div>
      </div>

      <div
        className="no-bar min-h-0 flex-1 overflow-y-auto"
        style={{ padding: "14px 16px 40px" }}
      >
        <div className="flex flex-col gap-2.5">
          {visits.map((v) => (
            <VisitCard key={v.id} record={v} onOpen={() => onOpenRecord(v)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function VisitCard({ record, onOpen }: { record: Restaurant; onOpen: () => void }) {
  const photo = coverPhoto(record);
  const summary = record.review || record.menu || "메모가 비어 있습니다";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full cursor-pointer items-start gap-3 rounded-[22px] border bg-card p-3 text-left ${
        record.verified ? "border-[#e0c3b1]" : "border-[#e4dfd3]"
      }`}
    >
      <div
        className="relative grid size-[72px] shrink-0 place-items-center rounded-[18px]"
        style={photoFill(photo, record.category)}
      >
        {!photo && (
          <span className="font-mono text-[9px] tracking-[0.08em] text-[rgba(251,250,246,.9)]">
            PHOTO
          </span>
        )}
        {record.verified && (
          <span className="absolute -right-[3px] -bottom-[3px]">
            <VerifiedMark size={24} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-serif text-[16px] font-bold text-ink">
            {record.name}
          </span>
          {record.revisit && (
            <span className="shrink-0 rounded-[9px] bg-brick-soft px-[7px] py-0.5 text-[9.5px] whitespace-nowrap text-brick">
              재방문
            </span>
          )}
        </div>

        <div className="mt-1 text-[11px] text-faint">
          {[record.category, record.region].filter(Boolean).join(" · ")}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <MobileStars rating={record.rating} size={12.5} />
          <span className="font-mono text-[10.5px] text-muted">
            {record.rating?.toFixed(1) ?? "—"}
          </span>
          {record.verified && record.verified_at && (
            <>
              <span className="h-[11px] w-px bg-[#ded8cb]" />
              <span className="font-mono text-[10.5px] text-brick">
                {verifiedTime(record.verified_at)}
              </span>
            </>
          )}
        </div>

        <div className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.5] text-[#4d4842]">
          {summary}
        </div>
      </div>
    </button>
  );
}

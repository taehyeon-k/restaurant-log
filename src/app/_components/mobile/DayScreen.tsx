"use client";

import { useMemo, useState } from "react";
import { coverPhoto, dottedDate, verifiedTime, type Restaurant, type Wish } from "@/lib/types";
import { BookmarkIcon, MobileStars, PlusIcon, VerifiedMark, photoFill } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "2026-08-09" → { month: 8, day: 9 } (앞자리 0 없이) */
function titleParts(dateKey: string) {
  const [, m, d] = dateKey.split("-").map(Number);
  return { month: m, day: d };
}

/**
 * 그날 화면 — 월력 칸을 누르면 열립니다. 기록이 있으면 카드로 모아 보여주고,
 * 없으면 그 날짜에 맞는 안내와 함께 바로 기록·계획을 추가할 수 있습니다.
 * 지난 날은 기록만, 오늘은 기록·계획 다, 다가올 날은 계획만 추가할 수 있습니다.
 */
export default function DayScreen({
  dateKey,
  rows,
  wishes,
  onBack,
  onOpenRecord,
  onOpenWish,
  onAddRecord,
  onAddWish,
}: {
  dateKey: string;
  rows: Restaurant[];
  wishes: Wish[];
  onBack: () => void;
  onOpenRecord: (record: Restaurant) => void;
  onOpenWish: (wish: Wish) => void;
  /** 이 날짜를 방문일로 채운 새 기록을 엽니다. */
  onAddRecord: () => void;
  /** 이 날짜를 예정일로 채운 새 계획을 엽니다. */
  onAddWish: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const visits = useMemo(
    () =>
      rows
        .filter((r) => r.visited_at === dateKey)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [rows, dateKey]
  );

  const dayWishes = useMemo(
    () =>
      wishes
        .filter((w) => w.plan_date === dateKey)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [wishes, dateKey]
  );

  const { month, day } = titleParts(dateKey);
  const today = todayKey();
  const isFuture = dateKey > today;
  const isToday = dateKey === today;
  const empty = visits.length === 0 && dayWishes.length === 0;

  function handlePlus() {
    if (isToday) {
      setMenuOpen((v) => !v);
      return;
    }
    setMenuOpen(false);
    if (isFuture) onAddWish();
    else onAddRecord();
  }

  const countLine =
    [
      visits.length ? `기록 ${visits.length}건` : null,
      dayWishes.length ? `예정 ${dayWishes.length}건` : null,
    ]
      .filter(Boolean)
      .join(" · ") || (isFuture ? "예정 없음" : "기록 없음");

  return (
    <div className="absolute inset-0 z-[1190] flex flex-col bg-paper">
      {menuOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-[5] cursor-default border-none bg-transparent"
        />
      )}

      <div
        className="relative z-10 shrink-0 border-b border-[#e6e0d3] bg-paper"
        style={{ padding: "44px 20px 16px" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="-ml-[10px] grid size-11 cursor-pointer place-items-center rounded-full border-none bg-transparent text-[17px] text-ink hover:bg-[#eee9de]"
          >
            ←
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={handlePlus}
              aria-label="기록·계획 추가"
              className="grid size-11 cursor-pointer place-items-center rounded-full border border-line bg-card text-ink hover:border-brick"
            >
              <span
                className="grid place-items-center transition-transform duration-200"
                style={{ transform: menuOpen ? "rotate(45deg)" : "none" }}
              >
                <PlusIcon />
              </span>
            </button>

            {menuOpen && (
              <div className="absolute top-[52px] right-0 z-10 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddRecord();
                  }}
                  className="flex min-h-[46px] cursor-pointer items-center gap-2 rounded-[16px] border-none bg-card px-4 shadow-[0_6px_16px_rgba(28,26,23,.14)]"
                >
                  <span className="block size-[22px] shrink-0 rounded-full border-[1.5px] border-[#8a8377]" />
                  <span className="text-[13px] whitespace-nowrap text-ink">기록 추가</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddWish();
                  }}
                  className="flex min-h-[46px] cursor-pointer items-center gap-2 rounded-[16px] border-none bg-card px-4 shadow-[0_6px_16px_rgba(28,26,23,.14)]"
                >
                  <BookmarkIcon size={20} stroke="#1c1a17" />
                  <span className="text-[13px] whitespace-nowrap text-ink">계획 추가</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 font-mono text-[10px] tracking-[0.18em] text-faint">
          {dottedDate(dateKey)}
        </div>
        <h1 className="mt-1 font-serif text-[26px] font-bold tracking-[-0.01em]">
          {visits.length > 0 ? `${month}월 ${day}일 방문한 식당` : `${month}월 ${day}일`}
        </h1>
        <div className="mt-1 text-[12px] text-[#a29a8c]">{countLine}</div>
      </div>

      <div
        className="no-bar min-h-0 flex-1 overflow-y-auto"
        style={{ padding: "14px 16px 40px" }}
      >
        {empty ? (
          <div className="mt-8 flex flex-col items-center gap-3.5 px-6 text-center">
            <div className="text-[13px] leading-[1.7] text-faint">
              {isFuture
                ? "아직 계획한 곳이 없습니다. 계획을 추가해보시겠습니까?"
                : "아직 방문한 식당이 없습니다. 기록을 추가해보시겠습니까?"}
            </div>
            <button
              type="button"
              onClick={isFuture ? onAddWish : onAddRecord}
              className="flex min-h-12 w-full max-w-[280px] cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-[#cdc6b8] bg-transparent text-[13px] text-[#6b665e] hover:border-brick hover:text-brick"
            >
              {isFuture ? "+ 계획 추가" : "+ 기록 추가"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visits.map((v) => (
              <VisitCard key={v.id} record={v} onOpen={() => onOpenRecord(v)} />
            ))}

            {dayWishes.length > 0 && (
              <div className={visits.length > 0 ? "mt-2" : ""}>
                {visits.length > 0 && (
                  <div className="mb-2 px-1 font-mono text-[10px] tracking-[0.16em] text-faint">
                    예정
                  </div>
                )}
                <div className="flex flex-col gap-2.5">
                  {dayWishes.map((w) => (
                    <WishRow key={w.id} wish={w} onOpen={() => onOpenWish(w)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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

function WishRow({ wish, onOpen }: { wish: Wish; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[22px] border border-dashed border-[#ded8cb] bg-transparent p-3 text-left hover:border-brick"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[#e0c3b1] bg-[#f9f0e9]">
        <BookmarkIcon size={16} fill="#b4552d" stroke="#b4552d" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-[15px] font-bold text-ink">{wish.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-faint">
          {[wish.category, wish.where_text].filter(Boolean).join(" · ") || "예정"}
        </div>
      </div>
    </button>
  );
}

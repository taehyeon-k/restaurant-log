"use client";

import { useMemo, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Eyebrow } from "./ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" — restaurants.visited_at 도 이 형식(날짜 입력 그대로)이라 문자열로 바로 비교합니다. */
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 칸 안 이름 칩 최대 글자 수. HANDOFF-calendar.md 는 4자를 최종값으로 적었지만,
 * 실제 한글 폰트(Noto Sans KR)로 재보면 390px 폭 · 7열 격자에서 4자+말줄임은
 * 어떤 여백으로도 들어가지 않습니다(칸 자체가 폭 49px 안팎). 3자는 여유 있게
 * 들어가 그대로 씁니다 — 이름이 잘려도 최소 3자는 보이게 하려던 요구를 지킵니다.
 */
const MAX_CHIP_CHARS = 3;

/** 칸 안 이름은 CSS 말줄임이 아니라 여기서 직접 자릅니다(예측 가능한 절단). */
const clipName = (name: string, max: number) =>
  name.length > max ? `${name.slice(0, max)}…` : name;

/** "YYYY-MM-DD" → { year, month(0-based) } */
function monthOfKey(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** 그 달을 앞뒤로 채워 온전한 주 단위 격자를 만듭니다(일요일 시작). */
function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(year, month, last.getDate() + (6 - last.getDay()));

  const cells: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    cells.push(new Date(d));
  }
  return cells;
}

/** 셀 배열을 7개씩 묶어 주 단위 행으로 나눕니다. */
function toWeeks(cells: Date[]) {
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 월력 — 기록의 visited_at 을 날짜별로 모아 달력 칸 안에 가게 이름 미리보기로 보여줍니다.
 * 칸 전체가 버튼입니다 — 누르면 그 날짜의 DayScreen 이 열립니다(칸 안 이름은 비활성 텍스트).
 * HANDOFF-calendar.md 1절.
 */
export default function CalendarScreen({
  rows,
  onOpenDay,
}: {
  rows: Restaurant[];
  onOpenDay: (dateKey: string) => void;
}) {
  const maxVisitedAt = useMemo(() => {
    let max: string | null = null;
    for (const r of rows) {
      if (r.visited_at && (!max || r.visited_at > max)) max = r.visited_at;
    }
    return max;
  }, [rows]);

  /** 이번 달이 비어 있을 수 있으니, 처음에는 가장 최근 기록이 있는 달을 엽니다. */
  const defaultCursor = useMemo(
    () => monthOfKey(maxVisitedAt ?? keyOf(new Date())),
    [maxVisitedAt]
  );

  const [cursorState, setCursorState] = useState<{ year: number; month: number } | null>(
    null
  );
  const cursor = cursorState ?? defaultCursor;

  const shiftMonth = (delta: number) =>
    setCursorState(() => {
      const d = new Date(cursor.year, cursor.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToday = () => {
    const d = new Date();
    setCursorState({ year: d.getFullYear(), month: d.getMonth() });
  };

  const byDate = useMemo(() => {
    const map = new Map<string, Restaurant[]>();
    for (const r of rows) {
      if (!r.visited_at) continue;
      const list = map.get(r.visited_at) ?? [];
      list.push(r);
      map.set(r.visited_at, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.name < b.name ? -1 : 1));
    return map;
  }, [rows]);

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);
  const weeks = useMemo(() => toWeeks(cells), [cells]);

  const monthPrefix = `${cursor.year}-${pad(cursor.month + 1)}`;
  const countThisMonth = rows.filter((r) => r.visited_at?.startsWith(monthPrefix)).length;

  const todayKey = keyOf(new Date());

  return (
    <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1160] flex flex-col bg-paper">
      <div className="shrink-0 px-[22px] pt-[52px]">
        <Eyebrow wide>CALENDAR</Eyebrow>

        <div className="mt-2 flex items-center justify-between gap-2">
          <h1 className="font-serif text-[22px] font-bold">
            {cursor.year}년 {cursor.month + 1}월
          </h1>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-card text-[15px] text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToday}
              className="cursor-pointer rounded-full border border-line bg-card px-3 py-[7px] text-[11px] text-muted"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-card text-[15px] text-ink"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-1.5 text-[12px] text-faint">이 달 기록 {countThisMonth}건</div>
      </div>

      <div className="mt-3.5 grid shrink-0 grid-cols-7 px-3 text-center font-mono text-[10px] text-faint">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-3 pt-1.5 pb-3">
        {weeks.map((week, i) => (
          <div key={i} className="flex min-h-0 flex-1 gap-1">
            {week.map((date) => {
              const key = keyOf(date);
              const inMonth = date.getMonth() === cursor.month;
              const visits = byDate.get(key) ?? [];
              const shown = visits.slice(0, 2);
              const extra = visits.length - shown.length;
              const isToday = key === todayKey;
              const clickable = inMonth && visits.length > 0;

              const borderClass = isToday
                ? "border-[1.5px] border-brick"
                : inMonth
                  ? "border border-line-soft"
                  : "border border-transparent";

              const cellClass = `flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] py-[5px] px-[1px] text-left ${borderClass} ${
                inMonth ? "bg-card" : ""
              }`;

              const content = (
                <>
                  <div
                    className={`shrink-0 px-1 font-mono text-[10.5px] ${
                      !inMonth ? "text-[#d3cdc0]" : isToday ? "font-bold text-brick" : "text-ink"
                    }`}
                  >
                    {date.getDate()}
                  </div>

                  {inMonth && visits.length > 0 && (
                    <div className="mt-1 flex min-h-0 flex-1 flex-col gap-[2px] overflow-hidden">
                      {shown.map((v) => (
                        <span
                          key={v.id}
                          className={`block w-full shrink-0 overflow-hidden rounded-[5px] px-[1px] py-[2px] text-[9px] leading-[1.35] whitespace-nowrap ${
                            v.verified
                              ? "bg-[#f2e0d5] text-[#a34d27]"
                              : "bg-[#eae5da] text-muted"
                          }`}
                        >
                          {clipName(v.name, MAX_CHIP_CHARS)}
                        </span>
                      ))}
                      {extra > 0 && (
                        <div className="shrink-0 px-1 font-mono text-[8.5px] text-[#a29a8c]">
                          +{extra}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );

              return clickable ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => onOpenDay(key)}
                  aria-label={`${cursor.year}년 ${cursor.month + 1}월 ${date.getDate()}일, 기록 ${visits.length}건`}
                  className={`${cellClass} cursor-pointer`}
                >
                  {content}
                </button>
              ) : (
                <div key={key} className={`${cellClass} cursor-default`}>
                  {content}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

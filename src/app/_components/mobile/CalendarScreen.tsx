"use client";

import { useMemo, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Eyebrow } from "./ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" — restaurants.visited_at 도 이 형식(날짜 입력 그대로)이라 문자열로 바로 비교합니다. */
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

/**
 * 월력 — 기록의 visited_at 을 날짜별로 모아 달력 칸 안에 가게 이름으로 보여줍니다.
 * 이름을 누르면 그 기록 상세(RecordScreen)를 엽니다.
 */
export default function CalendarScreen({
  rows,
  onOpenVisit,
}: {
  rows: Restaurant[];
  onOpenVisit: (record: Restaurant) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
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

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-3 pt-1.5 pb-6">
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date) => {
            const key = keyOf(date);
            const inMonth = date.getMonth() === cursor.month;
            const visits = byDate.get(key) ?? [];
            const shown = visits.slice(0, 2);
            const extra = visits.length - shown.length;
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={`min-h-[72px] rounded-[12px] border p-1 ${
                  inMonth ? "border-line-soft bg-card" : "border-transparent"
                } ${isToday ? "border-brick" : ""}`}
              >
                <div
                  className={`font-mono text-[10.5px] ${
                    !inMonth ? "text-[#d3cdc0]" : isToday ? "font-bold text-brick" : "text-ink"
                  }`}
                >
                  {date.getDate()}
                </div>

                {inMonth && visits.length > 0 && (
                  <div className="mt-1 flex flex-col gap-[3px]">
                    {shown.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onOpenVisit(v)}
                        className="block w-full cursor-pointer truncate rounded-[5px] border-none bg-brick-soft px-1 py-[1px] text-left text-[9px] leading-[1.4] text-brick"
                      >
                        {v.name}
                      </button>
                    ))}
                    {extra > 0 && (
                      <div className="px-1 text-[8.5px] text-faint">+{extra}개 더</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

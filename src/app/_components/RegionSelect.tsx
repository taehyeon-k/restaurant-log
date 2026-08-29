"use client";

import { useMemo, useState } from "react";
import { ALL_REGIONS, REGIONS, SUB_GU } from "@/lib/regions";

const selectClass =
  "h-11.5 min-w-0 flex-1 rounded-[3px] border border-line bg-card px-3 text-sm outline-none focus:border-brick";

/** 지역 선택 — 검색으로 한 번에 고르거나, 시·도부터 차례로 좁혀갑니다. */
export default function RegionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");

  const parts = value.split(" ").filter(Boolean);
  const sido = parts[0] ?? "";
  const si = parts[1] ?? "";
  const gu = parts[2] ?? "";

  const siList = REGIONS[sido] ?? [];
  const guList = SUB_GU[si] ?? [];

  const matches = useMemo(() => {
    const q = query.replace(/\s+/g, "");
    if (q.length < 1) return [];
    return ALL_REGIONS.filter((r) => r.replace(/\s+/g, "").includes(q)).slice(
      0,
      8
    );
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setQuery(""), 150)}
          placeholder="지역 검색 (예: 마포, 분당)"
          className={`${selectClass} w-full`}
        />

        {matches.length > 0 && (
          <ul className="absolute inset-x-0 top-13 z-10 overflow-hidden rounded-[3px] border border-line bg-card shadow-[0_12px_28px_rgba(28,26,23,0.12)]">
            {matches.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(r);
                    setQuery("");
                  }}
                  className="w-full cursor-pointer border-b border-line px-3 py-2.5 text-left text-[13px] last:border-0 hover:bg-brick-soft"
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={sido}
          onChange={(e) => onChange(e.target.value)}
          className={selectClass}
        >
          <option value="">시 · 도</option>
          {Object.keys(REGIONS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {siList.length > 0 && (
          <select
            value={si}
            onChange={(e) =>
              onChange(e.target.value ? `${sido} ${e.target.value}` : sido)
            }
            className={selectClass}
          >
            <option value="">시 · 군 · 구</option>
            {siList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {guList.length > 0 && (
          <select
            value={gu}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? `${sido} ${si} ${e.target.value}`
                  : `${sido} ${si}`
              )
            }
            className={selectClass}
          >
            <option value="">구</option>
            {guList.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

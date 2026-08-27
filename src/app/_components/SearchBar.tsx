"use client";

import { useEffect, useState } from "react";
import { useSearchState } from "@/lib/useSearchState";

export default function SearchBar({ defaultValue }: { defaultValue: string }) {
  const { set, reset } = useSearchState();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => setValue(defaultValue), [defaultValue]);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if (value === defaultValue) return;
    const t = setTimeout(() => set("q", value.trim() || null), 250);
    return () => clearTimeout(t);
  }, [value, defaultValue, set]);

  return (
    <div className="flex h-12 flex-1 items-center gap-3 rounded-[26px] border border-line bg-card px-4.5 shadow-[0_6px_18px_rgba(28,26,23,0.07)]">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--color-faint)"
        strokeWidth="1.6"
      >
        <circle cx="7" cy="7" r="4.6" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="이름 · 지역 · 종류 · 메뉴 · 키워드 검색"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#b3ada1]"
      />
      <button
        onClick={() => {
          setValue("");
          reset();
        }}
        className="cursor-pointer font-mono text-[11px] tracking-[0.08em] text-faint hover:text-brick"
      >
        초기화
      </button>
    </div>
  );
}

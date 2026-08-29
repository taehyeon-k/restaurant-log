"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchState } from "@/lib/useSearchState";

/** 내 기록을 거르는 검색창. 지도는 건드리지 않습니다. */
export default function SearchBar({ defaultValue }: { defaultValue: string }) {
  const { set } = useSearchState();
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();

  const sent = useRef(defaultValue);

  useEffect(() => {
    if (defaultValue !== sent.current) {
      sent.current = defaultValue;
      setValue(defaultValue);
    }
  }, [defaultValue]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === sent.current) return;

    const t = setTimeout(() => {
      sent.current = trimmed;
      startTransition(() => set("q", trimmed || null));
    }, 300);

    return () => clearTimeout(t);
  }, [value, set]);

  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[20px] border border-line bg-card px-3.5">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--color-faint)"
        strokeWidth="1.6"
        className="shrink-0"
      >
        <circle cx="7" cy="7" r="4.6" />
        <path d="M10.5 10.5L14 14" />
      </svg>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="내 기록 검색"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#b3ada1]"
      />

      {value && (
        <button
          onClick={() => {
            sent.current = "";
            setValue("");
            startTransition(() => set("q", null));
          }}
          className="shrink-0 cursor-pointer font-mono text-[11px] text-faint hover:text-brick"
        >
          ×
        </button>
      )}
    </div>
  );
}

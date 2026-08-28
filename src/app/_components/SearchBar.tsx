"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchState } from "@/lib/useSearchState";

export default function SearchBar({ defaultValue }: { defaultValue: string }) {
  const { set, reset } = useSearchState();
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();

  // 내가 마지막으로 URL 에 보낸 값. 서버가 이걸 그대로 돌려줘도 입력창은 건드리지 않습니다.
  const sent = useRef(defaultValue);

  // 뒤로가기·초기화처럼 바깥에서 바뀐 경우에만 입력창을 맞춥니다.
  useEffect(() => {
    if (defaultValue !== sent.current) {
      sent.current = defaultValue;
      setValue(defaultValue);
    }
  }, [defaultValue]);

  // 타자가 멎으면 검색. 입력 자체는 절대 막지 않습니다.
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
          sent.current = "";
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

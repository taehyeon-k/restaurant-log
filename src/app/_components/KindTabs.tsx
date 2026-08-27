"use client";

import { useSearchState } from "@/lib/useSearchState";
import type { Kind, Sort } from "@/lib/types";

export function tabClass(active: boolean) {
  return `cursor-pointer rounded-[18px] px-6.5 py-2.25 text-sm font-medium transition-all ${
    active ? "bg-ink text-paper" : "bg-transparent text-muted hover:text-ink"
  }`;
}

export default function KindTabs({ kind }: { kind: Kind }) {
  const { switchKind } = useSearchState();

  return (
    <div className="flex rounded-[22px] bg-[#eae5da] p-1">
      <button
        onClick={() => switchKind("restaurant")}
        className={tabClass(kind === "restaurant")}
      >
        맛집
      </button>
      <button
        onClick={() => switchKind("cafe")}
        className={tabClass(kind === "cafe")}
      >
        카페
      </button>
    </div>
  );
}

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "최근순" },
  { value: "rating", label: "별점순" },
  { value: "price", label: "가격순" },
];

export function SortButtons({ sort }: { sort: Sort }) {
  const { set } = useSearchState();

  return (
    <div className="flex gap-3.5 text-[13px]">
      {SORTS.map((s) => (
        <button
          key={s.value}
          onClick={() => set("sort", s.value === "recent" ? null : s.value)}
          className={`cursor-pointer ${
            sort === s.value
              ? "border-b border-ink font-medium text-ink"
              : "text-[#a8a196] hover:text-muted"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

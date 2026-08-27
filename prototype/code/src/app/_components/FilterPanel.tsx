"use client";

import { useSearchState } from "@/lib/useSearchState";

const chip = (active: boolean) =>
  `cursor-pointer rounded-[15px] border px-3.25 py-1.5 text-[12.5px] transition-all ${
    active
      ? "border-brick bg-brick text-[#fdf9f3]"
      : "border-[#cdc6b8] bg-transparent text-[#4a453d] hover:border-ink"
  }`;

function ChipRow({
  label,
  param,
  options,
}: {
  label: string;
  param: string;
  options: string[];
}) {
  const { has, toggle } = useSearchState();
  if (!options.length) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow w-[66px] shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.75">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => toggle(param, o)}
            className={chip(has(param, o))}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterPanel({
  facets,
  selected,
}: {
  facets: { categories: string[]; regions: string[]; keywords: string[] };
  selected: {
    categories: string[];
    regions: string[];
    keywords: string[];
    revisitOnly: boolean;
  };
}) {
  const { set } = useSearchState();

  return (
    <div className="flex flex-col gap-3.5 border-b border-line px-8 pt-5 pb-4.5">
      <ChipRow label="CATEGORY" param="category" options={facets.categories} />
      <ChipRow label="KEYWORD" param="keyword" options={facets.keywords} />
      <ChipRow label="REGION" param="region" options={facets.regions} />

      <label className="flex cursor-pointer items-center gap-2.25 text-[13px] text-[#4a453d]">
        <input
          type="checkbox"
          checked={selected.revisitOnly}
          onChange={(e) => set("revisit", e.target.checked ? "1" : null)}
          className="size-3.75 accent-brick"
        />
        재방문 의사 있는 곳만
      </label>
    </div>
  );
}

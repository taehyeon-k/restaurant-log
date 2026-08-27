import type { Sort } from "@/lib/types";
import { SortButtons } from "./KindTabs";

export default function SortRow({
  count,
  sort,
}: {
  count: number;
  sort: Sort;
}) {
  return (
    <div className="flex items-baseline justify-between px-8 pt-4.5 pb-2.5">
      <span className="eyebrow tracking-[0.14em]">기록 {count}곳</span>
      <SortButtons sort={sort} />
    </div>
  );
}

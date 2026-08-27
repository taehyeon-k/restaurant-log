"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { shortDate, stars, won, type Restaurant } from "@/lib/types";
import { useHover } from "./Workspace";

export default function ResultList({ rows }: { rows: Restaurant[] }) {
  const { hover, setHover } = useHover();
  const params = useSearchParams();

  const href = (id: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("id", String(id));
    return `/?${next}`;
  };

  if (!rows.length) {
    return (
      <div className="flex-1 px-8 pt-15 text-center text-sm leading-8 text-faint">
        조건에 맞는 기록이 없습니다.
        <br />
        <span className="text-[13px] text-[#a8a196]">
          필터를 줄이거나 검색어를 바꿔보세요.
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-8 pb-10">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={href(r.id)}
          scroll={false}
          onMouseEnter={() => setHover(r.id)}
          onMouseLeave={() => setHover(null)}
          className={`block rounded-[4px] border p-4 transition-all ${
            hover === r.id
              ? "border-[#cdc6b8] bg-card shadow-[0_6px_16px_rgba(28,26,23,0.07)]"
              : "border-line-soft bg-transparent"
          }`}
        >
          <div className="flex items-start gap-4">
            {r.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.photo_url}
                alt=""
                className="size-21 shrink-0 border border-[#ded8cb] object-cover"
              />
            ) : (
              <div className="flex size-21 shrink-0 items-center justify-center border border-[#ded8cb] bg-[#eae5da] font-mono text-[10px] tracking-[0.1em] text-[#a8a196]">
                PHOTO
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-1.75">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="font-serif text-[19px] font-bold tracking-[-0.01em]">
                  {r.name}
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-[#a8a196]">
                  {shortDate(r.visited_at)}
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-[13px] text-[#4a453d]">
                <span className="tracking-[0.14em] text-brick">
                  {stars(r.rating)}
                </span>
                <span className="font-mono text-xs">
                  {r.rating?.toFixed(1) ?? "—"}
                </span>
                <Divider />
                <span>{r.category}</span>
                <Divider />
                <span className="text-muted">{r.region}</span>
                <Divider />
                <span className="font-mono text-xs text-muted">
                  {won(r.price_range)}
                </span>
              </div>

              <div className="truncate text-[13px] leading-relaxed text-muted">
                {[r.menu, r.review].filter(Boolean).join(" · ")}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {r.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-[14px] border border-[#ded8cb] px-2.5 py-1 text-[11px] text-muted"
                  >
                    {k}
                  </span>
                ))}
                {r.revisit && (
                  <span className="rounded-[14px] border border-[#e2c9bb] bg-brick-soft px-2.5 py-1 text-[11px] text-brick">
                    재방문
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

const Divider = () => <span className="h-2.75 w-px bg-line" />;

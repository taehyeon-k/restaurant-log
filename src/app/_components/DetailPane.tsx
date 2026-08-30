"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Stars, type Restaurant } from "@/lib/types";
import { feltLabel, feltLevel } from "@/lib/price";
import PriceLevel from "./PriceLevel";

export default function DetailPane({ place }: { place: Restaurant }) {
  const params = useSearchParams();

  const backHref = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("id");
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-8 pt-5.5">
        <Link
          href={backHref()}
          scroll={false}
          className="text-[13px] text-faint hover:text-brick"
        >
          ← 목록으로
        </Link>
        <span className="font-mono text-[11px] tracking-[0.12em] text-faint">
          NO. {String(place.id).padStart(3, "0")}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-10 pt-4 pb-11">
        <h1 className="font-serif text-[40px] leading-tight font-bold tracking-[-0.01em]">
          {place.name}
        </h1>

        <div className="mt-3.5 flex items-center gap-3.5 text-sm text-[#4a453d]">
          <Stars rating={place.rating} size={16} />
          <span className="font-mono text-[13px]">
            {place.rating?.toFixed(1) ?? "—"}
          </span>
          <Divider />
          <span>{place.category}</span>
          <Divider />
          <PriceLevel row={place} size={18} />

          <span className="text-[13px] text-muted">
            {feltLabel(feltLevel(place))}
          </span>
        </div>

        <div className="mt-6 h-75 border border-line bg-[#eae5da]">
          {place.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.photo_url}
              alt={place.name}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-mono text-[11px] tracking-[0.1em] text-[#a8a196]">
              NO PHOTO
            </div>
          )}
        </div>

        {place.menu && (
          <Section label="메뉴">
            <p className="text-[15px] leading-relaxed">{place.menu}</p>
          </Section>
        )}

        {place.review && (
          <Section label="내가 남긴 메모">
            <p className="font-serif text-[17px] leading-[1.95] text-[#2e2a25] text-pretty">
              {place.review}
            </p>
            <div className="font-mono text-[11px] tracking-[0.08em] text-[#a8a196]">
              {place.visited_at?.replaceAll("-", ".")}
            </div>
          </Section>
        )}

        {place.keywords.length > 0 && (
          <Section label="키워드">
            <div className="flex flex-wrap gap-2">
              {place.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-[18px] border border-[#cdc6b8] px-3.5 py-1.75 text-[13px] text-[#4a453d]"
                >
                  {k}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section label="위치">
          <div className="text-sm leading-relaxed text-[#2e2a25]">
            {place.address ?? place.region ?? "주소 미등록"}
          </div>
          {place.revisit && (
            <div className="text-[13px] text-brick">다시 갈 곳으로 표시됨</div>
          )}
        </Section>

        <div className="mt-8 flex gap-2.5">
          <Link
            href={`/restaurant/${place.id}/edit`}
            className="flex h-12.5 flex-1 items-center justify-center rounded-[25px] bg-ink text-sm font-medium text-paper transition-colors hover:bg-brick"
          >
            기록 수정
          </Link>
          <Link
            href={backHref()}
            scroll={false}
            className="flex h-12.5 w-32 items-center justify-center rounded-[25px] border border-[#cdc6b8] text-sm"
          >
            닫기
          </Link>
        </div>
      </div>
    </div>
  );
}

const Divider = () => <span className="h-3.25 w-px bg-line" />;

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col gap-2.5 border-t border-line pt-7 first:border-0">
      <div className="eyebrow">{label}</div>
      {children}
    </div>
  );
}

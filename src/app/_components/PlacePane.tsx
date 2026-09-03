"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { coverPhoto } from "@/lib/types";
import type { Place } from "@/lib/places";
import Stars from "./Stars";
import PriceLevel from "./PriceLevel";

export default function PlacePane({ place }: { place: Place }) {
  const router = useRouter();

  async function remove(id: number, name: string) {
    if (!confirm(`"${name}" 기록을 삭제할까요?`)) return;
    const { error } = await supabase.from("restaurants").delete().eq("id", id);
    if (error) return alert(error.message);
    router.push(place.visits.length > 1 ? `/?place=${encodeURIComponent(place.key)}` : "/");
    router.refresh();
  }

  const addHref = `/add?${new URLSearchParams({
    name: place.name,
    address: place.address ?? "",
    lat: String(place.lat ?? ""),
    lng: String(place.lng ?? ""),
  })}`;

  // 기록마다 대표사진을 먼저 한 장씩, 자리가 남으면 나머지 사진으로 최대 5장.
  const gallery = useMemo(() => {
    const covers = place.visits.map((v) => coverPhoto(v)).filter((u): u is string => !!u);
    const rest = place.visits.flatMap((v) =>
      v.photo_urls?.length ? v.photo_urls : v.photo_url ? [v.photo_url] : []
    );
    return [...new Set([...covers, ...rest])].slice(0, 5);
  }, [place]);

  const [shown, setShown] = useState(0);
  const big = gallery[Math.min(shown, Math.max(0, gallery.length - 1))];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-8 pt-5.5">
        <Link href="/" scroll={false} className="text-[13px] text-faint hover:text-brick">
          ← 목록으로
        </Link>
        <span className="font-mono text-[11px] tracking-[0.12em] text-faint">
          기록 {place.visits.length}개
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-10 pt-4 pb-11">
        <h1 className="font-serif text-[40px] leading-tight font-bold tracking-[-0.01em]">
          {place.name}
        </h1>

        <div className="mt-3.5 flex min-w-0 items-center gap-3.5 text-sm text-[#4a453d]">
          <Stars rating={place.rating} size={16} />
          <span className="font-mono text-[13px]">{place.rating?.toFixed(1) ?? "—"}</span>
          <Divider />
          <PriceLevel row={place} size={18} />
          <Divider />
          <span className="whitespace-nowrap">{place.category}</span>
          <Divider />
          <span
            className="whitespace-nowrap text-muted"
            style={
              (place.region?.length ?? 0) >= 4
                ? { fontSize: "12px", letterSpacing: "-0.02em" }
                : undefined
            }
          >
         {place.region}
          </span>
        </div>

        {gallery.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5">
           <div className="aspect-[4/3] overflow-hidden border border-line bg-[#eae5da]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={big} alt={place.name} className="h-full w-full object-cover object-center" />
            </div>

            {gallery.length > 1 && (
              <div className="flex items-center gap-2">
                {gallery.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setShown(i)}
                    className={`size-15 shrink-0 cursor-pointer overflow-hidden p-0 ${
                      i === shown
                        ? "border-[1.5px] border-brick"
                        : "border border-[#ded8cb] opacity-75 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="size-full object-cover" />
                  </button>
                ))}
                <span className="ml-1 text-[12px] text-[#a8a196]">
                  기록 사진 {gallery.length}장
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-7.5 flex flex-col gap-3">
          <div className="eyebrow">내가 남긴 기록</div>

          {place.visits.map((v) => {
            
            return (
              <div
                key={v.id}
                className="rounded-[4px] border border-line-soft p-4 transition-all hover:border-[#cdc6b8] hover:bg-card hover:shadow-[0_6px_16px_rgba(28,26,23,0.07)]"
              >
                <div className="flex gap-4">
                  

                  <div className="flex min-w-0 flex-1 flex-col gap-1.75">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11.5px] tracking-[0.06em] text-[#a8a196]">
                        {v.visited_at?.replaceAll("-", ".")}
                      </span>
                      <Stars rating={v.rating} size={13} />
                      <span className="font-mono text-xs text-muted">
                        {v.rating?.toFixed(1) ?? "—"}
                      </span>

                      <span className="flex flex-1 justify-end gap-2.5">
                        <Link
                          href={`/restaurant/${v.id}/edit`}
                          className="text-[12px] text-faint hover:text-brick"
                        >
                          수정
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(v.id, place.name)}
                          className="cursor-pointer text-[12px] text-faint hover:text-[#9a4a52]"
                        >
                          삭제
                        </button>
                      </span>
                    </div>

                    <Link href={`/?rid=${v.id}`} scroll={false} className="flex flex-col gap-1.75">
                      <span className="truncate text-[13px] text-faint">{v.menu}</span>
                      <span className="line-clamp-3 font-serif text-[13.5px] leading-[1.75] whitespace-pre-wrap break-words text-[#4a453d]">
                        {v.review}
                      </span>
                      <span className="text-[12px] text-brick">상세히 보기 →</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex gap-2.5">
          <Link
            href={addHref}
            className="flex h-12.5 flex-1 items-center justify-center rounded-[25px] bg-ink text-sm font-medium whitespace-nowrap text-paper transition-colors hover:bg-brick"
          >
            + 새 방문 기록
          </Link>
          <Link
            href="/"
            scroll={false}
            className="flex h-12.5 w-24 shrink-0 items-center justify-center rounded-[25px] border border-[#cdc6b8] text-sm"
          >
            닫기
          </Link>
        </div>
      </div>
    </div>
  );
}

const Divider = () => <span className="h-3.25 w-px bg-line" />;

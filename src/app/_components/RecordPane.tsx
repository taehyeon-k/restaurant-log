"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { coverPhoto, type Restaurant } from "@/lib/types";
import type { Place } from "@/lib/places";
import Stars from "./Stars";
import PriceLevel from "./PriceLevel";

export default function RecordPane({
  record,
  place,
}: {
  record: Restaurant;
  place: Place | null;
}) {
  const router = useRouter();

  const many = (place?.visits.length ?? 1) > 1;
  const backHref = many ? `/?place=${encodeURIComponent(place!.key)}` : "/";
  const backLabel = many ? `← ${record.name} 기록 ${place!.visits.length}개` : "← 목록으로";

  const photos = record.photo_urls?.length
    ? record.photo_urls
    : record.photo_url
      ? [record.photo_url]
      : [];

  // 처음에는 대표사진, 썸네일을 누르면 그 사진이 크게 뜹니다.
  const [shown, setShown] = useState(
    Math.min(record.cover_index ?? 0, Math.max(0, photos.length - 1))
  );
  const cover = photos[shown] ?? coverPhoto(record);

  async function remove() {
    if (!confirm(`"${record.name}" 기록을 삭제할까요?`)) return;
    const { error } = await supabase.from("restaurants").delete().eq("id", record.id);
    if (error) return alert(error.message);
    router.push(many ? backHref : "/");
    router.refresh();
  }

 const addHref = `/add?${new URLSearchParams({
    name: record.name,
    address: record.address ?? "",
    lat: String(record.lat ?? ""),
    lng: String(record.lng ?? ""),
  })}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 px-8 pt-5.5">
        <Link
          href={backHref}
          scroll={false}
          className="text-[13px] whitespace-nowrap text-faint hover:text-brick"
        >
          {backLabel}
        </Link>
        <span className="font-mono text-[11px] tracking-[0.12em] whitespace-nowrap text-faint">
          NO. {String(record.id).padStart(3, "0")}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-10 pt-4 pb-11">
        <h1 className="font-serif text-[40px] leading-tight font-bold tracking-[-0.01em]">
          {record.name}
        </h1>

        <div className="mt-3 font-mono text-[12px] tracking-[0.08em] text-[#a8a196]">
          {record.visited_at?.replaceAll("-", ".")}
        </div>

        <div className="mt-3.5 flex min-w-0 items-center gap-3.5 text-sm text-[#4a453d]">
          <Stars rating={record.rating} size={16} />
          <span className="font-mono text-[13px]">{record.rating?.toFixed(1) ?? "—"}</span>
          <Divider />
          <PriceLevel row={record} size={18} />
          <Divider />
          <span className="whitespace-nowrap">{record.category}</span>
          <Divider />
          <span
            className="whitespace-nowrap text-muted"
            style={
              (record.region?.length ?? 0) >= 4
                ? { fontSize: "12px", letterSpacing: "-0.02em" }
                : undefined
            }
          >
           {record.region}
          </span>
        </div>

        <div className="mt-6 aspect-[4/3] border border-line bg-[#eae5da]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={record.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center font-mono text-[11px] tracking-[0.1em] text-[#a8a196]">
              NO PHOTO
            </div>
          )}
        </div>

        {photos.length > 1 && (
          <div className="mt-2.5 flex items-center gap-2">
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setShown(i)}
                className={`relative size-15 shrink-0 cursor-pointer overflow-hidden p-0 ${
                  i === shown
                    ? "border-[1.5px] border-brick"
                    : "border border-[#ded8cb] opacity-75 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
                {i === (record.cover_index ?? 0) && (
                  <span className="absolute right-0 bottom-0 bg-ink px-1 py-0.25 text-[9px] text-paper">
                    대표
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {record.menu && (
          <Section label="메뉴">
            <p className="text-[15px] leading-relaxed">{record.menu}</p>
          </Section>
        )}

        {record.review && (
          <Section label="내가 남긴 메모">
            <p className="font-serif text-[17px] leading-[1.95] whitespace-pre-wrap break-words text-[#2e2a25]">
              {record.review}
            </p>
          </Section>
        )}

        {record.keywords.length > 0 && (
          <Section label="키워드">
            <div className="flex flex-wrap gap-2">
              {record.keywords.map((k) => (
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
            {record.address ?? record.region ?? "주소 미등록"}
          </div>
          {record.revisit && (
            <div className="text-[13px] text-brick">다시 갈 곳으로 표시됨</div>
          )}
        </Section>

        <div className="mt-8 flex flex-col gap-2.5">
          <Link
            href={addHref}
            className="flex h-12.5 items-center justify-center rounded-[25px] border border-[#e2c9bb] bg-brick-soft text-sm font-medium whitespace-nowrap text-brick transition-colors hover:border-brick"
          >
            + 이 가게에 새 방문 기록
          </Link>
        </div>

        <div className="mt-2.5 flex gap-2.5">
          <Link
            href={`/restaurant/${record.id}/edit`}
            className="flex h-12.5 flex-1 items-center justify-center rounded-[25px] bg-ink text-sm font-medium whitespace-nowrap text-paper transition-colors hover:bg-brick"
          >
            이 기록 수정
          </Link>
          <button
            type="button"
            onClick={remove}
            className="flex h-12.5 w-29 shrink-0 cursor-pointer items-center justify-center rounded-[25px] border border-[#cdc6b8] text-sm whitespace-nowrap text-[#4a453d] transition-colors hover:border-[#9a4a52] hover:text-[#9a4a52]"
          >
            기록 삭제
          </button>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-col gap-2.5 border-t border-line pt-7">
      <div className="eyebrow">{label}</div>
      {children}
    </div>
  );
}

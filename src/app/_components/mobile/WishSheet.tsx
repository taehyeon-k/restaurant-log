"use client";

import { dottedDate, type Wish } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { BellIcon, BookmarkIcon, ExternalLinkIcon } from "./ui";
import { firstUrl, noteWithoutUrl } from "./WishForm";

/** 지도에서 책갈피 마커를 눌렀을 때 뜨는 그 가게 하나짜리 시트(§5). */
export default function WishSheet({
  wish,
  onClose,
  onCaptureHere,
  onViewList,
  onChanged,
  onDeleted,
}: {
  wish: Wish;
  onClose: () => void;
  onCaptureHere: () => void;
  onViewList: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const url = firstUrl(wish.note);
  const noteBody = noteWithoutUrl(wish.note, url);

  async function toggleNotify() {
    setBusy(true);
    await supabase.from("wishes").update({ notify: !wish.notify }).eq("id", wish.id);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`"${wish.name}" 을(를) 위시리스트에서 지울까요?`)) return;
    setBusy(true);
    await supabase.from("wishes").delete().eq("id", wish.id);
    setBusy(false);
    onDeleted();
  }

  return (
    <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1400] flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 cursor-pointer border-none bg-transparent"
      />

      <div className="rounded-t-[28px] bg-paper px-5 pt-[18px] pb-[26px] shadow-[0_-8px_30px_rgba(28,26,23,.2)]">
        <div className="flex items-center gap-1.5">
          <BookmarkIcon size={15} fill="#b4552d" stroke="#b4552d" />
          <span className="font-mono text-[9.5px] tracking-[0.18em] text-brick">위시리스트</span>
        </div>

        <h1 className="mt-1.5 font-serif text-[22px] font-bold">{wish.name}</h1>
        <div className="mt-1 text-[11.5px] text-faint">
          {[wish.category, wish.where_text].filter(Boolean).join(" · ")}
        </div>

        {wish.plan_date && (
          <span className="mt-2.5 inline-block rounded-[9px] border border-[#e0c3b1] bg-[#f9f0e9] px-2.5 py-1 font-mono text-[10.5px] text-brick">
            {dottedDate(wish.plan_date)} 갈 예정
          </span>
        )}

        <div className="mt-3 font-serif text-[14px] leading-[1.85] whitespace-pre-wrap text-[#2e2a25]">
          {noteBody || "적어둔 말이 없습니다."}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onCaptureHere}
            className="flex min-h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[18px] border-none bg-ink text-[13.5px] font-medium text-card"
          >
            여기 왔어요 · 사진 찍기
          </button>

          <button
            type="button"
            onClick={toggleNotify}
            disabled={busy}
            aria-label="근처 알림"
            className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border disabled:opacity-50 ${
              wish.notify ? "border-[#e0c3b1] bg-[#f7ece5] text-brick" : "border-line bg-card text-muted"
            }`}
          >
            <BellIcon size={16} />
          </button>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label="출처 열기"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-card text-muted"
            >
              <ExternalLinkIcon size={16} />
            </a>
          )}
        </div>

        <div className="mt-3 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={onViewList}
            className="cursor-pointer border-none bg-transparent px-2 py-1 text-center text-[12px] text-faint"
          >
            위시리스트에서 보기
          </button>
          <span className="text-[12px] text-[#d8d3c8]">·</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="cursor-pointer border-none bg-transparent px-2 py-1 text-center text-[12px] text-faint hover:text-[#9a4a52] disabled:opacity-50"
          >
            지우기
          </button>
        </div>
      </div>
    </div>
  );
}

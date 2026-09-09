"use client";

import { BookmarkIcon, Eyebrow } from "./ui";

/**
 * 「아직 없는 곳」 시트 — 검색한 이름이 기록에도 위시에도 없을 때(§10).
 * 담아둔 곳을 검색했는데 "어느 쪽에도 없다"고 말하면 안 되므로, 이 시트는
 * 기록·위시 양쪽에서 이름을 찾아본 뒤에만(§10 검색 순서) 떠야 합니다.
 */
export default function SearchMissSheet({
  name,
  onAddRecord,
  onAddWish,
  onClose,
}: {
  name: string;
  onAddRecord: () => void;
  onAddWish: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1400] flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 cursor-pointer border-none bg-transparent"
      />

      <div className="rounded-t-[24px] bg-paper px-5 pt-4 pb-6 shadow-[0_-8px_30px_rgba(28,26,23,.18)]">
        <Eyebrow wide>아직 없는 곳</Eyebrow>
        <div className="mt-1.5 font-serif text-[22px] font-bold">{name}</div>
        <div className="mt-1.5 text-[11.5px] leading-[1.6] text-faint">
          기록에도 가고싶다에도 없는 이름입니다. 어느 쪽으로 둘까요?
        </div>

        <div className="mt-3.5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onAddRecord}
            className="flex min-h-[50px] cursor-pointer items-center justify-center gap-2 rounded-[18px] border-none bg-ink text-[13.5px] font-medium text-card"
          >
            <span className="block size-[19px] shrink-0 rounded-full bg-card" />
            다녀왔어요 · 기록 추가
          </button>
          <button
            type="button"
            onClick={onAddWish}
            className="flex min-h-[50px] cursor-pointer items-center justify-center gap-2 rounded-[18px] border border-[#ded8cb] bg-transparent text-[13.5px] font-medium text-ink"
          >
            <BookmarkIcon size={14} stroke="#1c1a17" />
            가고 싶어요 · 예정 추가
          </button>
        </div>
      </div>
    </div>
  );
}

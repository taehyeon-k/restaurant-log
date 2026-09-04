"use client";

import { chipClass, Eyebrow } from "./ui";

/** 아래에서 올라오는 "골라 보기" 시트. */
export default function FilterSheet({
  categories,
  keywords,
  selectedCategories,
  selectedKeywords,
  revisitOnly,
  verifiedOnly,
  count,
  onToggleCategory,
  onToggleKeyword,
  onToggleRevisit,
  onToggleVerified,
  onReset,
  onClose,
}: {
  categories: string[];
  keywords: string[];
  selectedCategories: string[];
  selectedKeywords: string[];
  revisitOnly: boolean;
  verifiedOnly: boolean;
  count: number;
  onToggleCategory: (c: string) => void;
  onToggleKeyword: (k: string) => void;
  onToggleRevisit: () => void;
  onToggleVerified: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[1500] flex flex-col justify-end bg-[rgba(28,26,23,.34)]">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 cursor-pointer border-none bg-transparent"
      />

      <div className="rounded-t-[28px] bg-paper px-5 pt-[18px] pb-[26px] shadow-[0_-8px_30px_rgba(28,26,23,.2)]">
        <div className="flex items-center justify-between">
          <div className="font-serif text-[18px] font-bold">골라 보기</div>
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer border-none bg-transparent py-1.5 text-[12px] text-faint"
          >
            모두 지우기
          </button>
        </div>

        {categories.length > 0 && (
          <>
            <div className="mt-4">
              <Eyebrow>종류</Eyebrow>
            </div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onToggleCategory(c)}
                  className={chipClass(selectedCategories.includes(c))}
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {keywords.length > 0 && (
          <>
            <div className="mt-[18px]">
              <Eyebrow>낱말</Eyebrow>
            </div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {keywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onToggleKeyword(k)}
                  className={chipClass(selectedKeywords.includes(k))}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-[18px] flex gap-[7px]">
          <button type="button" onClick={onToggleRevisit} className={chipClass(revisitOnly)}>
            재방문한 곳만
          </button>
          <button type="button" onClick={onToggleVerified} className={chipClass(verifiedOnly)}>
            인증된 기록만
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-[22px] w-full cursor-pointer rounded-[20px] border-none bg-ink p-4 text-[14.5px] font-medium text-card"
        >
          {count}곳 보기
        </button>
      </div>
    </div>
  );
}

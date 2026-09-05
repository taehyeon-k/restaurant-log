"use client";

import { earnedLabels, type EarnedLabel } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";
import { Eyebrow } from "./ui";

/**
 * 라벨첩. 획득 조건은 아직 확정 전이라 `src/lib/labels.ts` 의 잠정 규칙을 씁니다.
 */
export default function LabelBook({
  rows,
  onClose,
}: {
  rows: Restaurant[];
  onClose: () => void;
}) {
  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned).length;

  return (
    <div className="absolute inset-0 z-[1450] bg-paper">
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute left-3.5 z-[2] grid size-11 cursor-pointer place-items-center rounded-full border-none bg-transparent text-[17px] text-ink"
        style={{ top: "max(48px, calc(env(safe-area-inset-top) + 6px))" }}
      >
        ←
      </button>

      <div
        className="absolute inset-x-[22px]"
        style={{ top: "max(104px, calc(env(safe-area-inset-top) + 62px))" }}
      >
        <Eyebrow wide>LABELS</Eyebrow>
        <h1 className="mt-2 font-serif text-[26px] font-bold">라벨첩</h1>
        <div className="mt-1.5 text-[12px] text-faint">
          모은 라벨 {got} / {labels.length}
        </div>
      </div>

      <div
        className="no-bar absolute inset-x-0 bottom-0 overflow-y-auto px-[22px] pb-10"
        style={{ top: "max(196px, calc(env(safe-area-inset-top) + 154px))" }}
      >
        <div className="grid grid-cols-3 gap-x-3.5 gap-y-[26px]">
          {labels.map((l) => (
            <div key={l.id} className="flex flex-col items-center gap-2.5">
              <Shape label={l} />
              <div className="text-center">
                <div
                  className={`font-serif text-[13px] font-bold ${
                    l.earned ? "text-ink" : "text-faint"
                  }`}
                >
                  {l.name}
                </div>
                <div className="mt-[3px] text-[10px] leading-[1.45] text-faint">
                  {l.earned || l.need === 1
                    ? l.desc
                    : `${l.desc} · ${Math.min(l.have, l.need)}/${l.need}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 도형은 clip-path — 물결과 45° 회전 사각만 예외입니다. */
/** 통일된 도장 배지와 라벨별 인라인 선 그림. */
function Shape({ label }: { label: EarnedLabel }) {
  const progress = Math.min(1, label.have / label.need);
  const color = label.earned ? label.color : "#eae5da";

  return <div className={`label-badge label-badge-${label.id} grid size-[92px] place-items-center rounded-full p-1`} style={{ background: `conic-gradient(${label.color} ${progress * 360}deg, #ded8cb 0)`, filter: label.earned ? "drop-shadow(0 4px 12px rgba(28,26,23,.12))" : undefined }}>
    <div className="grid size-[84px] place-items-center rounded-full border border-dashed border-[#cfc7b6] font-serif text-[30px] font-bold" style={{ background: color, color: label.earned ? "#fbfaf6" : "#b3aa9a", boxShadow: "inset 0 0 0 1px rgba(251,250,246,.45)" }}><svg aria-label={label.name} width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="16" cy="16" r="9" />{label.id === "verified" ? <path d="m11 16 3 3 7-7" /> : <path d="M11 21h10M13 18h6M14 14h4" />}</svg></div>
  </div>;
}

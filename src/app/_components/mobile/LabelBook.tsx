"use client";

import { earnedLabels, type EarnedLabel } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";
import { CLIP, Eyebrow } from "./ui";

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
function Shape({ label }: { label: EarnedLabel }) {
  const on = label.earned;

  const base: React.CSSProperties = {
    width: 76,
    height: 76,
    fontSize: 26,
    color: on ? "#fbfaf6" : "#6f695f",
    background: on ? label.color : "#dbd4c5",
  };

  let style: React.CSSProperties = base;
  let glyphStyle: React.CSSProperties | undefined;

  if (label.shape === "diamond") {
    style = {
      ...base,
      width: 60,
      height: 60,
      fontSize: 22,
      borderRadius: 16,
      transform: "rotate(45deg)",
      margin: "8px 0",
    };
    glyphStyle = { transform: "rotate(-45deg)" };
  } else if (label.shape === "scallop") {
    style = { ...base, borderRadius: "42% 58% 45% 55% / 50% 46% 54% 50%" };
  } else if (label.shape === "check") {
    style = {
      ...base,
      clipPath: CLIP.check,
      fontSize: 34,
      fontWeight: 400,
      paddingBottom: 3,
    };
  } else {
    style = { ...base, clipPath: CLIP[label.shape] };
  }

  return (
    <div
      className="grid place-items-center font-serif leading-none font-bold"
      style={style}
    >
      <span style={glyphStyle}>{label.glyph}</span>
    </div>
  );
}

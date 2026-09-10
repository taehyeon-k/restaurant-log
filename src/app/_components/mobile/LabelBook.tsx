"use client";

import { earnedLabels, regionTitles, REGION_EN, type EarnedLabel, type RegionTitle } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";
import { Eyebrow } from "./ui";

/** 보안관 배지 — 육각 별. 등급이 달라도 모양은 하나, 색만 바뀝니다. */
const SHERIFF_STAR =
  "polygon(50% 0%, 68% 18.8%, 93.3% 25%, 86% 50%, 93.3% 75%, 68% 81.2%, 50% 100%, 32% 81.2%, 6.7% 75%, 14% 50%, 6.7% 25%, 32% 18.8%)";

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
  const districts = regionTitles(rows);
  const gotDistricts = districts.filter((t) => t.tier).length;

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
        {districts.length > 0 && (
          <div className="mb-[30px]">
            <div className="flex items-baseline justify-between gap-2.5">
              <Eyebrow>DISTRICTS</Eyebrow>
              <span className="text-[11px] text-[#a29a8c]">받은 칭호 {gotDistricts}개</span>
            </div>
            <div className="mt-[5px] text-[11.5px] leading-[1.6] text-faint">
              한 구에서 인증한 기록이 쌓이면 칭호를 받습니다. 10곳 러버, 30곳 보안관, 50곳 맛잘알.
            </div>
            <div className="mt-4 grid grid-cols-3 gap-x-3.5 gap-y-[22px]">
              {districts.map((t) => (
                <DistrictBadge key={t.region} title={t} />
              ))}
            </div>
          </div>
        )}

        {districts.length > 0 && <div className="mb-4"><Eyebrow>LABELS</Eyebrow></div>}

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

/** 동네 칭호 배지 — 육각 별 하나에 등급색만 바뀝니다. */
function DistrictBadge({ title }: { title: RegionTitle }) {
  const { region, have, tier, next } = title;
  const on = tier !== null;
  const color = on ? tier.color : "#cfc7b6";

  const progress = on
    ? next
      ? `인증 ${have} · 다음 ${next.need}`
      : `인증 ${have} · 끝까지 왔습니다`
    : `인증 ${have} / ${next?.need ?? 10}`;

  return (
    <div className="flex flex-col items-center gap-[9px]">
      <div className="relative">
        <div
          className="grid size-[78px] place-items-center"
          style={{
            clipPath: SHERIFF_STAR,
            background: color,
            filter: on ? "drop-shadow(0 3px 9px rgba(28,26,23,.16))" : undefined,
          }}
        >
          <div
            className="flex size-[46px] flex-col items-center justify-center gap-0.5 rounded-full px-1 text-center font-mono leading-[1.1]"
            style={{ background: on ? tier.ink : "#f1ede4", color: on ? "#3a3128" : "#a8a094" }}
          >
            <span className="text-[8px] font-bold tracking-[0.02em]">{REGION_EN[region] ?? region}</span>
            {on && (
              <span className="text-[7px] tracking-[0.06em] text-[#7a6a52]">
                {"★★★".slice(0, tier.stars)}
              </span>
            )}
          </div>
        </div>

        {on && (
          <div
            className="absolute -right-0.5 -bottom-0.5 grid size-[22px] place-items-center rounded-full border bg-card font-serif text-[11px] font-bold"
            style={{ borderColor: tier.color, color: tier.color }}
          >
            {tier.tier}
          </div>
        )}
      </div>

      <div className="text-center">
        <div className={`font-serif text-[13px] font-bold ${on ? "text-ink" : "text-faint"}`}>
          {on ? `${region} ${tier.suffix}` : region}
        </div>
        <div className="mt-[3px] font-mono text-[9.5px] leading-[1.45] text-faint">{progress}</div>
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

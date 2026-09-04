"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { dottedDate, type Restaurant } from "@/lib/types";
import { photosOf } from "./record";
import { Eyebrow, MobileStars, Pigs, VerifiedMark, photoFill } from "./ui";
import { SAFE_TOP } from "./MobileShell";

export default function RecordScreen({
  record,
  onBack,
  onEdit,
  onChanged,
  onDeleted,
}: {
  record: Restaurant;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const photos = photosOf(record);
  const cover = Math.min(record.cover_index ?? 0, Math.max(0, photos.length - 1));

  const [shown, setShown] = useState(cover);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = photos[shown] ?? null;

  async function makeCover() {
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        cover_index: shown,
        photo_url: photos[shown] ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    setBusy(false);
    if (error) return setError(error.message);
    onChanged();
  }

  async function remove() {
    if (!confirm(`"${record.name}" 기록을 지울까요?`)) return;
    setBusy(true);
    const { error } = await supabase.from("restaurants").delete().eq("id", record.id);
    setBusy(false);
    if (error) return setError(error.message);
    onDeleted();
  }

  const verifyNote =
    "그 자리에서 찍은 사진으로 인증되었습니다." +
    (record.acc ? ` 촬영 시 위치 정확도 약 ${record.acc}m.` : "") +
    " 좌표는 기록에 남지 않습니다.";

  return (
    <div className="absolute inset-0 z-[1250] flex flex-col bg-paper">
      <div
        className="relative grid h-[268px] shrink-0 place-items-center"
        style={photoFill(current, record.category)}
      >
        {!current && (
          <span className="font-mono text-[10px] tracking-[0.14em] text-[rgba(251,250,246,.9)]">
            PHOTO {shown + 1} / {Math.max(1, photos.length)}
          </span>
        )}

        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="absolute left-4 grid size-11 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.92)] text-[17px] text-ink"
          style={{ top: SAFE_TOP }}
        >
          ←
        </button>

        {record.verified && (
          <span className="absolute right-4 bottom-4">
            <VerifiedMark size={50} shadow />
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <div className="no-bar flex shrink-0 items-center gap-[7px] overflow-x-auto border-b border-[#e6e0d3] px-4 py-2.5">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setShown(i)}
              aria-label={`사진 ${i + 1}`}
              className={`relative size-[54px] shrink-0 cursor-pointer overflow-hidden rounded-[14px] bg-[#eae5da] ${
                i === shown ? "border-[1.5px] border-brick" : "border border-[#ded8cb]"
              }`}
              style={photoFill(url, record.category)}
            >
              {i === cover && (
                <span className="absolute top-0.5 right-[3px] font-mono text-[8px] text-brick">
                  ★
                </span>
              )}
            </button>
          ))}

          {photos.length > 1 && shown !== cover && (
            <button
              type="button"
              onClick={makeCover}
              disabled={busy}
              className="min-h-11 shrink-0 cursor-pointer rounded-[14px] border border-dashed border-line bg-transparent px-[13px] text-[11.5px] whitespace-nowrap text-muted disabled:opacity-50"
            >
              대표사진으로
            </button>
          )}
        </div>
      )}

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-[22px] pt-5 pb-10">
        <Eyebrow>NO. {String(record.id).padStart(3, "0")}</Eyebrow>

        <h1 className="mt-2 font-serif text-[25px] font-bold">{record.name}</h1>

        <div className="mt-[7px] flex items-center gap-2 text-[12px] text-faint">
          <span>{record.category}</span>
          {record.region && (
            <>
              <span>·</span>
              <span>{record.region}</span>
            </>
          )}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <MobileStars rating={record.rating} size={15} gap={1.5} />
          <span className="font-mono text-[12px] text-muted">
            {record.rating?.toFixed(1) ?? "—"}
          </span>
          <span className="h-[13px] w-px bg-[#ded8cb]" />
          <Pigs row={record} w={18} h={17} />
        </div>

        <div className="mt-[22px] flex flex-col gap-[18px] border-t border-[#ded8cb] pt-[18px]">
          <Row label="방문">
            <span className="text-[13.5px]">
              {dottedDate(record.visited_at) || "날짜를 쓰지 않았습니다"}
            </span>
          </Row>

          <Row label="메뉴">
            <span className="text-[13.5px] leading-[1.6]">
              {record.menu || "아직 쓰지 않았습니다"}
            </span>
          </Row>

          <Row label="메모">
            <span className="font-serif text-[16px] leading-[1.95] whitespace-pre-line text-[#2e2a25]">
              {record.review || "메모가 비어 있습니다."}
            </span>
          </Row>

          <Row label="주소">
            <span className="text-[12.5px] text-[#4d4842]">
              {record.address ?? record.region ?? "주소 미등록"}
            </span>
          </Row>
        </div>

        {record.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {record.keywords.map((k) => (
              <span
                key={k}
                className="rounded-[14px] border border-[#e2dccf] px-2.5 py-1 text-[11px] text-muted"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        {record.verified && (
          <div className="mt-5 rounded-[18px] border border-[#e4dfd3] bg-card px-4 py-3.5 text-[11.5px] leading-[1.7] text-muted">
            {verifyNote}
          </div>
        )}

        {error && <p className="mt-4 text-[12px] text-[#a8412a]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-[50px] flex-1 cursor-pointer rounded-[18px] border-none bg-ink text-[13.5px] font-medium text-card"
          >
            기록 수정
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="min-h-[50px] shrink-0 cursor-pointer rounded-[18px] border border-[#e4dfd3] bg-transparent px-[18px] text-[12.5px] text-faint disabled:opacity-50"
          >
            지우기
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-[7px]">{children}</div>
    </div>
  );
}

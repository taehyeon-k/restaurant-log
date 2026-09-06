"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { Eyebrow, VerifiedMark, photoFill } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026.09.06 13:24 · 인증됨" */
function meta(r: Restaurant) {
  const d = new Date(r.created_at);
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${date} ${time}${r.verified ? " · 인증됨" : ""}`;
}

/**
 * 보관함 — 사진을 찍고 «나중에 쓸게요»를 눌러 아직 본문을 쓰지 않은
 * 기록(pending)만 모은 화면. LabelBook 과 같은 골격입니다.
 */
export default function DraftsScreen({
  drafts,
  onClose,
  onWrite,
  onDeleted,
}: {
  drafts: Restaurant[];
  onClose: () => void;
  onWrite: (record: Restaurant) => void;
  onDeleted: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function discard(id: number) {
    setBusyId(id);
    setError("");
    const { error } = await supabase.from("restaurants").delete().eq("id", id);
    setBusyId(null);
    if (error) return setError(error.message);
    onDeleted();
  }

  return (
    <div className="absolute inset-0 z-[1400] bg-paper">
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
        <Eyebrow wide>DRAFTS</Eyebrow>
        <h1 className="mt-2 font-serif text-[26px] font-bold">보관함</h1>
        <div className="mt-1.5 text-[12px] text-faint">
          {drafts.length ? `아직 쓰지 않은 기록 ${drafts.length}개` : "비어 있습니다"}
        </div>
      </div>

      <div
        className="no-bar absolute inset-x-0 bottom-0 overflow-y-auto px-5 pb-10"
        style={{ top: "max(196px, calc(env(safe-area-inset-top) + 154px))" }}
      >
        {drafts.length === 0 ? (
          <div className="px-5 py-11 text-center text-[12.5px] leading-[1.8] text-faint">
            아직 쓰지 않은 기록이 없습니다.
            <br />
            사진을 찍고 «나중에 쓸게요»를 누르면 여기에 담깁니다.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {drafts.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-[20px] border border-[#e0c3b1] bg-card p-3"
              >
                <div
                  className="relative size-16 shrink-0 rounded-[15px]"
                  style={photoFill(coverPhoto(r), r.category)}
                >
                  {r.verified && (
                    <span className="absolute -right-[3px] -bottom-[3px]">
                      <VerifiedMark size={22} shadow />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-[15.5px] font-bold text-ink">
                    {r.name}
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] text-faint">{meta(r)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onWrite(r)}
                      className="cursor-pointer rounded-[15px] border-none bg-ink px-3.5 py-2 text-[12px] text-card"
                    >
                      기록 쓰기
                    </button>
                    <button
                      type="button"
                      onClick={() => discard(r.id)}
                      disabled={busyId === r.id}
                      className="cursor-pointer border-none bg-transparent px-1 py-2 text-[12px] text-[#a29a8c] hover:text-[#9a4a52] disabled:opacity-50"
                    >
                      버리기
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3.5 text-[12.5px] text-[#a8412a]">{error}</p>}
      </div>
    </div>
  );
}

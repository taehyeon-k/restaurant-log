"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { releasePastWishes } from "@/lib/queries";
import { dottedDate, type Wish } from "@/lib/types";
import { BellIcon, BookmarkIcon, CameraIcon, Eyebrow, ExternalLinkIcon } from "./ui";
import { firstUrl, noteWithoutUrl, type WishFormTarget } from "./WishForm";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function meta(w: Wish) {
  return [w.category, w.where_text].filter(Boolean).join(" · ");
}

/**
 * 가고싶다 — 아직 가지 않은 곳을 담아두는 목록(HANDOFF-wish.md §3).
 * 기록과는 다른 테이블·다른 화면입니다 — 인증마크·별점·사진·메뉴가 없습니다.
 */
export default function WishScreen({
  wishes,
  onOpenForm,
  onVerify,
  onChanged,
}: {
  wishes: Wish[];
  onOpenForm: (target: WishFormTarget) => void;
  /** 「방문 인증」 — 이 위시를 인증 대상으로 들고 카메라를 켭니다(HANDOFF-verify.md §2). */
  onVerify: (wish: Wish) => void;
  onChanged: () => void;
}) {
  const [datingId, setDatingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const swept = useRef(false);

  // 불러온 뒤 한 번 훑어서 지난 예정은 조용히 「언젠가」로 되돌립니다(§2).
  // 마운트 때 한 번만 돌면 되므로, 그 순간의 wishes 를 그대로 씁니다.
  useEffect(() => {
    if (swept.current) return;
    swept.current = true;
    releasePastWishes(wishes).then((next) => {
      if (next !== wishes) onChanged();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dated = wishes.filter((w) => w.plan_date).sort((a, b) => (a.plan_date! < b.plan_date! ? -1 : 1));
  const someday = wishes.filter((w) => !w.plan_date);

  async function clearDate(id: string) {
    setBusyId(id);
    await supabase.from("wishes").update({ plan_date: null }).eq("id", id);
    setBusyId(null);
    onChanged();
  }

  async function setDate(id: string, date: string) {
    setBusyId(id);
    await supabase.from("wishes").update({ plan_date: date || null }).eq("id", id);
    setBusyId(null);
    setDatingId(null);
    onChanged();
  }

  async function toggleNotify(w: Wish) {
    setBusyId(w.id);
    await supabase.from("wishes").update({ notify: !w.notify }).eq("id", w.id);
    setBusyId(null);
    onChanged();
  }

  const countLine = dated.length
    ? `담아둔 곳 ${wishes.length}곳 · 날짜 정한 곳 ${dated.length}곳`
    : `담아둔 곳 ${wishes.length}곳`;

  return (
    <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1160] flex flex-col bg-paper">
      <div className="shrink-0 px-5 pt-12 pb-3.5">
        <Eyebrow wide>WISHLIST</Eyebrow>
        <h1 className="mt-2 font-serif text-[22px] font-bold">가고싶다</h1>
        <div className="mt-1.5 text-[12px] text-faint">{countLine}</div>
        <div className="mt-2 text-[11.5px] leading-[1.6] text-faint">
          아직 가지 않은 곳입니다. 인증 도장은 그 자리에서 사진을 찍을 때만 붙습니다.
        </div>

        <button
          type="button"
          onClick={() => onOpenForm({ mode: "new" })}
          className="mt-3.5 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-[#cdc6b8] bg-transparent text-[13px] text-[#6b665e] hover:border-brick hover:text-brick"
        >
          + 가고 싶은 곳 담기
        </button>
      </div>

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {wishes.length === 0 ? (
          <div className="px-5 py-11 text-center text-[12.5px] leading-[1.8] text-faint">
            아직 담아둔 곳이 없습니다.
          </div>
        ) : (
          <>
            {dated.length > 0 && (
              <Section title="날짜를 정한 곳">
                {dated.map((w) => (
                  <WishCard
                    key={w.id}
                    wish={w}
                    dated
                    dating={datingId === w.id}
                    busy={busyId === w.id}
                    onOpen={() => onOpenForm({ mode: "edit", wish: w })}
                    onClearDate={() => clearDate(w.id)}
                    onStartDating={() => setDatingId(w.id)}
                    onCancelDating={() => setDatingId(null)}
                    onSetDate={(d) => setDate(w.id, d)}
                    onToggleNotify={() => toggleNotify(w)}
                    onVerify={() => onVerify(w)}
                  />
                ))}
              </Section>
            )}

            {someday.length > 0 && (
              <Section title="언젠가">
                {someday.map((w) => (
                  <WishCard
                    key={w.id}
                    wish={w}
                    dated={false}
                    dating={datingId === w.id}
                    busy={busyId === w.id}
                    onOpen={() => onOpenForm({ mode: "edit", wish: w })}
                    onClearDate={() => clearDate(w.id)}
                    onStartDating={() => setDatingId(w.id)}
                    onCancelDating={() => setDatingId(null)}
                    onSetDate={(d) => setDate(w.id, d)}
                    onToggleNotify={() => toggleNotify(w)}
                    onVerify={() => onVerify(w)}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-3">
      <div className="px-1 font-mono text-[10px] tracking-[0.16em] text-faint">{title}</div>
      <div className="mt-2 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function WishCard({
  wish,
  dated,
  dating,
  busy,
  onOpen,
  onClearDate,
  onStartDating,
  onCancelDating,
  onSetDate,
  onToggleNotify,
  onVerify,
}: {
  wish: Wish;
  dated: boolean;
  dating: boolean;
  busy: boolean;
  onOpen: () => void;
  onClearDate: () => void;
  onStartDating: () => void;
  onCancelDating: () => void;
  onSetDate: (date: string) => void;
  onToggleNotify: () => void;
  onVerify: () => void;
}) {
  const url = firstUrl(wish.note);
  const noteBody = noteWithoutUrl(wish.note, url);

  return (
    <div
      className={`relative rounded-[20px] p-[13px] pr-[14px] pl-[14px] ${
        dated ? "border border-[#e0c3b1] bg-card" : "border border-dashed border-[#ded8cb] bg-transparent"
      }`}
    >
      {dated && (
        <div className="absolute top-[13px] right-[14px] flex items-center gap-1.5">
          <span className="rounded-[9px] border border-dashed border-brick px-2 font-mono text-[10.5px] text-brick">
            {dottedDate(wish.plan_date)}
          </span>
          <button
            type="button"
            onClick={onClearDate}
            disabled={busy}
            aria-label="날짜 지우기"
            className="grid size-[26px] cursor-pointer place-items-center rounded-full border border-[#e0c3b1] bg-card text-[12px] text-muted disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      )}

      <button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left">
        <div className={dated ? "pr-[92px]" : ""}>
          <div className="font-serif text-[16px] font-bold text-ink">{wish.name}</div>
          {meta(wish) && <div className="mt-1 text-[11px] text-faint">{meta(wish)}</div>}
        </div>
        {noteBody && (
          <div className="mt-2 font-serif text-[12.5px] leading-[1.7] whitespace-pre-wrap text-[#4d4842]">
            {noteBody}
          </div>
        )}
      </button>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleNotify}
          disabled={busy}
          aria-label="근처 알림"
          className={`grid size-[30px] cursor-pointer place-items-center rounded-full border disabled:opacity-50 ${
            wish.notify ? "border-[#e0c3b1] bg-[#f7ece5] text-brick" : "border-transparent bg-transparent text-[#a29a8c]"
          }`}
        >
          <BellIcon size={14} />
        </button>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[26px] cursor-pointer items-center gap-1 rounded-[15px] border border-[#ded8cb] px-2.5 text-[11px] text-muted"
          >
            <ExternalLinkIcon size={11} />
            출처 보기
          </a>
        )}

        {!dated &&
          (dating ? (
            <input
              type="date"
              autoFocus
              min={today()}
              defaultValue=""
              onChange={(e) => onSetDate(e.target.value)}
              onBlur={(e) => !e.target.value && onCancelDating()}
              className="min-h-[26px] rounded-[15px] border border-brick bg-card px-2 font-mono text-[11px] text-ink outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onStartDating}
              className="min-h-[26px] cursor-pointer rounded-[15px] border border-[#ded8cb] px-2.5 text-[11px] text-muted"
            >
              날짜 정하기
            </button>
          ))}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="min-h-[30px] cursor-pointer rounded-[15px] border border-[#e4dfd3] bg-transparent px-[11px] text-[11px] text-muted hover:border-brick hover:text-brick"
          >
            수정
          </button>
          <button
            type="button"
            onClick={onVerify}
            className="flex min-h-[30px] cursor-pointer items-center gap-1 rounded-[15px] border-none bg-ink px-[11px] text-[11px] font-medium text-card"
          >
            <CameraIcon size={12} stroke="#fbfaf6" width={1.8} />
            방문 인증
          </button>
        </div>
      </div>

      {wish.lat != null && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[#a29a8c]">
          <BookmarkIcon size={10} stroke="#a29a8c" />
          지도에 자리 있음
        </div>
      )}
    </div>
  );
}

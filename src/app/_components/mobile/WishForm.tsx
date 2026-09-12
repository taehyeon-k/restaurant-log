"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_CATEGORIES, matchWish, type Wish } from "@/lib/types";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { chipClass, Eyebrow, ToggleSwitch } from "./ui";
import SpotPicker from "./SpotPicker";

export type WishFormTarget =
  | {
      mode: "new";
      /** 검색·기록에서 예정으로 담을 때 미리 채우는 값(§9). */
      preset?: {
        name?: string;
        where_text?: string;
        category?: string;
        lat?: number;
        lng?: number;
      };
    }
  | { mode: "edit"; wish: Wish };

/** 자유 글에서 첫 URL만 뽑아냅니다 — 「출처 보기」 단추가 이걸 씁니다. */
export const firstUrl = (text: string | null) => text?.match(/https?:\/\/[^\s]+/)?.[0] ?? null;

/** 카드·시트에 보여줄 때는 URL 을 지운 본문만 보여줍니다(§4). 편집칸 자체는 그대로 둡니다. */
export const noteWithoutUrl = (text: string | null, url: string | null) => {
  if (!text) return "";
  return (url ? text.replace(url, "") : text).replace(/\n{3,}/g, "\n\n").trim();
};

const fieldClass =
  "mt-[7px] min-h-[46px] w-full rounded-[14px] border border-[#ded8cb] bg-card px-[14px] text-[14px] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick";

export default function WishForm({
  target,
  wishes,
  onCancel,
  onSaved,
  onDuplicate,
}: {
  target: WishFormTarget;
  /** 새로 담을 때 같은 이름 방어에 씁니다(§9) — saveWish 쪽 안전망. */
  wishes: Wish[];
  onCancel: () => void;
  onSaved: () => void;
  /** 이미 같은 이름의 위시가 있으면 새로 만들지 않고 그 위시를 돌려줍니다. */
  onDuplicate: (wish: Wish) => void;
}) {
  const wish = target.mode === "edit" ? target.wish : null;
  const isNew = wish === null;
  const preset = target.mode === "new" ? target.preset : undefined;

  const [name, setName] = useState(wish?.name ?? preset?.name ?? "");
  const [whereText, setWhereText] = useState(wish?.where_text ?? preset?.where_text ?? "");
  const [category, setCategory] = useState(wish?.category ?? preset?.category ?? "");
  const [note, setNote] = useState(wish?.note ?? "");
  const [planDate, setPlanDate] = useState(wish?.plan_date ?? "");
  const [notify, setNotify] = useState(wish?.notify ?? false);
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(
    wish?.lat != null && wish?.lng != null
      ? { lat: wish.lat, lng: wish.lng }
      : preset?.lat != null && preset?.lng != null
        ? { lat: preset.lat, lng: preset.lng }
        : null
  );
  const [picking, setPicking] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 「자리」 칸에서 바로 가게를 찾아 위치를 잡습니다 — 지도에서 손으로 짚지 않아도 되게.
  const [spotResults, setSpotResults] = useState<Place[]>([]);
  const [spotOpen, setSpotOpen] = useState(false);
  const [spotBusy, setSpotBusy] = useState(false);
  const skipSpotSearch = useRef(false);

  useEffect(() => {
    if (skipSpotSearch.current) {
      skipSpotSearch.current = false;
      return;
    }
    if (!spotOpen || whereText.trim().length < 2) {
      setSpotResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSpotBusy(true);
      try {
        setSpotResults(await forwardGeocode(whereText, ctrl.signal));
      } catch {
        /* aborted or offline */
      } finally {
        setSpotBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [whereText, spotOpen]);

  function chooseSpot(p: Place) {
    skipSpotSearch.current = true;
    setWhereText(p.name || p.address);
    setSpot({ lat: p.lat, lng: p.lng });
    setSpotOpen(false);
    setSpotResults([]);
    if (!name.trim()) setName(p.name);
  }

  const missing = !name.trim() ? "가게 이름을 적어주세요" : "";
  const canSave = !missing;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");

    const cleanName = name.trim();

    // 같은 이름의 위시가 이미 있으면 중복으로 만들지 않고 그 위시로 돌려보냅니다.
    if (isNew) {
      const dup = matchWish(wishes, cleanName);
      if (dup) {
        setSaving(false);
        onDuplicate(dup);
        return;
      }
    }

    const payload = {
      name: cleanName,
      where_text: whereText.trim() || null,
      category: category || null,
      note: note.trim() || null,
      plan_date: planDate || null,
      notify,
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
    };

    const { error } = isNew
      ? await supabase.from("wishes").insert(payload)
      : await supabase.from("wishes").update(payload).eq("id", wish!.id);

    setSaving(false);
    if (error) return setError(error.message);
    onSaved();
  }

  if (picking) {
    return (
      <SpotPicker
        initial={spot}
        onCancel={() => setPicking(false)}
        onPick={(lat, lng, found) => {
          setSpot({ lat, lng });
          if (!whereText.trim()) setWhereText(found ? found.name || found.address : "지도에서 고른 자리");
          if (found?.name && !name.trim()) setName(found.name);
          setPicking(false);
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-[1500] flex flex-col justify-end bg-[rgba(28,26,23,.34)]">
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="flex-1 cursor-pointer border-none bg-transparent"
      />

      <div className="no-bar max-h-[88%] overflow-y-auto rounded-t-[28px] bg-paper px-5 pt-[18px] pb-[26px] shadow-[0_-8px_30px_rgba(28,26,23,.2)]">
        <h1 className="font-serif text-[18px] font-bold">
          {isNew ? "가고 싶은 곳" : "가고 싶은 곳 고치기"}
        </h1>

        <div className="mt-[11px] flex flex-col gap-[11px]">
          <label className="block">
            <Eyebrow>가게</Eyebrow>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="가게 이름"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <Eyebrow>자리</Eyebrow>
            <div className="mt-[7px] flex items-center gap-[7px]">
              <div className="relative min-w-0 flex-1">
                <input
                  value={whereText}
                  onChange={(e) => {
                    setWhereText(e.target.value);
                    setSpotOpen(true);
                    if (spot) setSpot(null);
                  }}
                  onFocus={() => setSpotOpen(true)}
                  onBlur={() => setTimeout(() => setSpotOpen(false), 150)}
                  placeholder="가게 이름으로 찾기, 또는 동네나 주소"
                  className="min-h-[46px] w-full rounded-[14px] border border-[#ded8cb] bg-card px-[14px] text-[14px] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick"
                />

                {spotBusy && (
                  <span className="absolute top-1/2 right-3.5 -translate-y-1/2 font-mono text-[10px] text-faint">
                    검색 중…
                  </span>
                )}

                {spotOpen && spotResults.length > 0 && (
                  <ul className="absolute inset-x-0 top-[50px] z-10 overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_12px_28px_rgba(28,26,23,.12)]">
                    {spotResults.map((p, i) => (
                      <li key={`${p.lat}-${p.lng}-${i}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => chooseSpot(p)}
                          className="flex w-full flex-col gap-0.5 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-brick-soft"
                        >
                          <span className="text-[13px] font-medium text-ink">{p.name || p.address}</span>
                          <span className="text-[11px] text-muted">{p.address}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPicking(true)}
                className={`min-h-[46px] shrink-0 cursor-pointer rounded-[14px] border px-3 text-[12px] whitespace-nowrap ${
                  spot ? "border-brick text-brick" : "border-[#ded8cb] text-muted"
                }`}
              >
                {spot ? "자리 정해짐 · 다시 고르기" : "지도에서 고르기"}
              </button>
            </div>
            {spot && (
              <div className="mt-1.5 text-[11px] text-brick">검색으로 찾은 자리가 정확히 잡혔습니다.</div>
            )}
          </label>

          <div>
            <Eyebrow>종류</Eyebrow>
            <div className="mt-[9px] flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory((p) => (p === c ? "" : c))}
                  className={chipClass(category === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <Eyebrow>가고 싶은 이유, 어디서 봤는지</Eyebrow>
            <textarea
              rows={6}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="마음껏 적어두세요. 링크를 붙여두면 카드에서 바로 열립니다."
              className="mt-[7px] w-full resize-none rounded-[14px] border border-[#ded8cb] bg-card px-3.5 py-3 font-serif text-[14px] leading-[1.8] text-[#2e2a25] outline-none placeholder:text-[#b3ada1] focus:border-brick"
            />
          </label>

          <label className="block">
            <Eyebrow>언제 갈지 (비워도 됩니다)</Eyebrow>
            <input
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className={`${fieldClass} font-mono text-[13px]`}
            />
          </label>

          <div className="flex items-center justify-between gap-3.5 rounded-[18px] border border-[#e2c9bb] bg-[#f9f0e9] px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink">근처를 지나면 알려주기</div>
              <div className="mt-1 text-[11.5px] leading-[1.55] text-[#6b665e]">
                이 가게에만 걸리는 알림입니다.
              </div>
            </div>
            <ToggleSwitch checked={notify} onChange={() => setNotify((v) => !v)} label="근처 알림" />
          </div>
        </div>

        {error && <p className="mt-3.5 text-[12.5px] text-[#a8412a]">{error}</p>}

        {canSave ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-[18px] w-full cursor-pointer rounded-[20px] border-none bg-ink p-4 text-[14.5px] font-medium text-card disabled:opacity-60"
          >
            {saving ? "담는 중…" : isNew ? "담기" : "고치기"}
          </button>
        ) : (
          <span className="mt-[18px] block w-full rounded-[20px] bg-[#e4dfd3] p-4 text-center text-[14.5px] text-faint">
            {missing}
          </span>
        )}
      </div>
    </div>
  );
}

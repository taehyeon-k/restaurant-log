"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, KEYWORDS, type Kind, type MenuItem, type Restaurant } from "@/lib/types";
import { FELT_PRICE } from "@/lib/price";
import { forwardGeocode } from "@/lib/geocode";
import { regionFromAddress } from "@/lib/regions";
import { chipClass, Eyebrow } from "./ui";

export type EditTarget =
  | {
      mode: "new";
      kind: Kind;
      /** 지도 검색에서 고른 자리 — 이름·주소·좌표를 미리 채웁니다. */
      preset?: { name?: string; address?: string; lat?: number; lng?: number };
    }
  | { mode: "edit"; record: Restaurant };

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fieldClass =
  "mt-[7px] min-h-[46px] w-full rounded-[14px] border border-[#ded8cb] bg-card px-[14px] text-[14px] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick";

const menuDigits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 9);

/**
 * 기록 작성 폼 — 새 기록·기록 고치기가 같은 화면입니다.
 * 값은 dinary-handoff-2/HANDOFF-2.md 10번 명세 그대로입니다.
 */
export default function EditScreen({
  target,
  rows,
  onCancel,
  onSaved,
}: {
  target: EditTarget;
  rows: Restaurant[];
  onCancel: () => void;
  onSaved: (saved: { id: number; kind: Kind }) => void;
}) {
  const record = target.mode === "edit" ? target.record : null;
  const isNew = record === null;
  const kind: Kind = record?.kind ?? (target.mode === "new" ? target.kind : "restaurant");
  const categories = CATEGORIES[kind];
  const preset = target.mode === "new" ? target.preset : undefined;

  const [name, setName] = useState(record?.name ?? preset?.name ?? "");
  const [address, setAddress] = useState(record?.address ?? preset?.address ?? "");
  const [visitedAt, setVisitedAt] = useState(record?.visited_at ?? today());
  const [category, setCategory] = useState(record?.category ?? "");
  const [rating, setRating] = useState(record?.rating ?? 0);
  const [priceLevel, setPriceLevel] = useState(record?.price_level ?? 0);
  const [revisit, setRevisit] = useState(record?.revisit ?? false);
  const [menus, setMenus] = useState<MenuItem[]>(() => {
    if (record?.menus?.length) return record.menus;
    const names = (record?.menu ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return names.length ? names.map((n) => ({ name: n, price: null })) : [{ name: "", price: null }];
  });
  const [review, setReview] = useState(record?.review ?? "");
  const [keywords, setKeywords] = useState<string[]>(record?.keywords ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setMenuAt = (i: number, patch: Partial<MenuItem>) =>
    setMenus((p) => p.map((m, n) => (n === i ? { ...m, ...patch } : m)));
  const addMenu = () => setMenus((p) => [...p, { name: "", price: null }]);
  const removeMenu = (i: number) =>
    setMenus((p) => (p.length === 1 ? p : p.filter((_, n) => n !== i)));

  const menuTotal = menus.reduce((sum, m) => sum + (m.price ?? 0), 0);
  const namedMenus = menus.filter((m) => m.name.trim() || m.price);
  const menuTotalLabel = namedMenus.length
    ? `${namedMenus.length}개 · ${menuTotal.toLocaleString("ko-KR")}원`
    : "";

  const ratingText = rating ? rating.toFixed(1) : "고르지 않음";
  const feltLabel = priceLevel ? FELT_PRICE[priceLevel - 1] : "고르지 않음";
  const revisitNote = revisit
    ? "다시 갈 곳으로 표시됩니다 — 지도 핀도 색이 찹니다."
    : "켜면 목록 필터와 지도 핀에 함께 반영됩니다.";

  /** 같은 이름의 가게가 이미 있으면 좌표·주소를 물려받습니다. */
  const twin = useMemo(() => {
    if (!isNew) return null;
    const needle = name.trim();
    if (!needle) return null;
    return rows.find((r) => r.name === needle && r.kind === kind) ?? null;
  }, [isNew, name, kind, rows]);

  const missing = !name.trim()
    ? "가게 이름을 적어주세요"
    : !rating
      ? "별점을 매겨주세요"
      : "";
  const canSave = !missing;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");

    try {
      const cleanName = name.trim();
      const cleanAddress = address.trim();

      const shared = {
        name: cleanName,
        category: category || null,
        address: cleanAddress || null,
        rating: rating || null,
        menu: menus.map((m) => m.name.trim()).filter(Boolean).join(", ") || null,
        menus: menus.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), price: m.price })),
        price_level: priceLevel || null,
        price_range: menuTotal || null,
        review: review.trim() || null,
        revisit,
        visited_at: visitedAt || null,
        keywords,
        updated_at: new Date().toISOString(),
      };

      if (!isNew) {
        const region = regionFromAddress(cleanAddress) || record!.region;
        const { error } = await supabase
          .from("restaurants")
          .update({ ...shared, region, pending: false })
          .eq("id", record!.id);
        if (error) throw new Error(error.message);

        onSaved({ id: record!.id, kind: record!.kind });
        return;
      }

      // 좌표: 같은 가게가 있으면 그 값, 검색에서 고른 자리면 그 좌표,
      // 둘 다 없으면 주소·상호로 한 번 찾아봅니다.
      let lat = twin?.lat ?? preset?.lat ?? null;
      let lng = twin?.lng ?? preset?.lng ?? null;

      if (lat == null || lng == null) {
        const hit =
          (cleanAddress ? (await forwardGeocode(cleanAddress).catch(() => []))[0] : null) ??
          (await forwardGeocode(cleanName).catch(() => []))[0] ??
          null;
        if (hit) {
          lat = hit.lat;
          lng = hit.lng;
        }
      }

      const finalAddress = cleanAddress || twin?.address || null;
      const finalRegion = twin?.region || regionFromAddress(finalAddress ?? "") || null;

      const { data, error } = await supabase
        .from("restaurants")
        .insert({
          kind,
          region: finalRegion,
          place_key: `${cleanName}|${finalAddress ?? ""}`.toLowerCase(),
          lat,
          lng,
          verified: false,
          acc: null,
          ...shared,
          address: finalAddress,
          // 같은 이름의 가게가 이미 있으면 그 자체로 재방문입니다.
          revisit: revisit || Boolean(twin),
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      onSaved({ id: data.id as number, kind });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다");
      setSaving(false);
    }
  }

  const saveLabel = canSave ? (saving ? "저장 중…" : "기록 저장") : missing;

  return (
    <div className="absolute inset-0 z-[1300] flex flex-col bg-paper">
      <div
        className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[#e6e0d3] px-3.5"
        style={{ paddingTop: 46, paddingBottom: 12 }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] whitespace-nowrap text-faint"
        >
          취소
        </button>

        <span className="font-mono text-[10.5px] tracking-[0.16em] text-faint">
          {isNew ? "NEW RECORD" : "EDIT RECORD"}
        </span>

        {canSave ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] font-medium whitespace-nowrap text-brick disabled:opacity-60"
          >
            저장
          </button>
        ) : (
          <span className="px-2 text-[13px] whitespace-nowrap text-[#c4bcae]">저장</span>
        )}
      </div>

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-[22px] pt-5 pb-10">
        <h1 className="font-serif text-[25px] font-bold">
          {isNew ? "오늘 뭐 먹었나요" : "기록 고치기"}
        </h1>

        <label className="mt-[18px] block">
          <Eyebrow>가게</Eyebrow>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="가게 이름"
            className={fieldClass}
          />
        </label>

        <label className="mt-3.5 block">
          <Eyebrow>자리</Eyebrow>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="주소나 동네"
            className={fieldClass}
          />
        </label>

        <label className="mt-3.5 block">
          <Eyebrow>방문</Eyebrow>
          <input
            type="date"
            value={visitedAt}
            onChange={(e) => setVisitedAt(e.target.value)}
            className={`${fieldClass} font-mono text-[13px]`}
          />
        </label>

        <div className="mt-[18px] flex flex-col gap-[9px]">
          <Eyebrow>종류</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
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

        <div className="mt-5 flex flex-col gap-[9px]">
          <Eyebrow>별점</Eyebrow>
          <div className="flex items-center gap-2.5">
            <span className="flex">
              {[1, 2, 3, 4, 5].map((n) => {
                const pct = rating >= n ? "100%" : rating >= n - 0.5 ? "50%" : "0%";
                const pick = (v: number) => () => setRating(v === rating ? 0 : v);
                return (
                  <span key={n} className="relative block size-[34px]">
                    <span className="absolute inset-0 grid place-items-center text-[27px] leading-none text-[#dcd6ca]">★</span>
                    <span className="absolute inset-0 block overflow-hidden" style={{ width: pct }}>
                      <span className="absolute top-0 left-0 grid size-[34px] place-items-center text-[27px] leading-none text-brick">★</span>
                    </span>
                    <button type="button" onClick={pick(n - 0.5)} aria-label="반 별" className="absolute top-0 left-0 h-full w-1/2 cursor-pointer border-none bg-transparent p-0" />
                    <button type="button" onClick={pick(n)} aria-label="한 별" className="absolute top-0 right-0 h-full w-1/2 cursor-pointer border-none bg-transparent p-0" />
                  </span>
                );
              })}
            </span>
            <span className="font-mono text-[12px] text-[#6b665e]">{ratingText}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-[9px]">
          <Eyebrow>체감 가격</Eyebrow>
          <div className="flex items-center gap-2.5">
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPriceLevel((p) => (p === n ? 0 : n))}
                  aria-label="가격"
                  className="grid size-[34px] cursor-pointer place-items-center border-none bg-transparent p-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/piggy.png"
                    alt=""
                    width={22}
                    height={21}
                    className={`block object-contain ${n <= priceLevel ? "opacity-100" : "opacity-30 grayscale-[0.85]"}`}
                  />
                </button>
              ))}
            </span>
            <span className="text-[12px] text-[#6b665e]">{feltLabel}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3.5 rounded-[18px] border border-[#e2c9bb] bg-[#f9f0e9] px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-ink">재방문 의사</div>
            <div className="mt-1 text-[11.5px] leading-[1.55] text-[#6b665e]">{revisitNote}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={revisit}
            aria-label="재방문 의사"
            onClick={() => setRevisit((v) => !v)}
            className={`relative h-7 w-[50px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150 ${revisit ? "bg-brick" : "bg-[#d8d3c8]"}`}
          >
            <span
              className="absolute top-0.5 size-6 rounded-full bg-card shadow-[0_1px_3px_rgba(28,26,23,.28)] transition-[left] duration-150"
              style={{ left: revisit ? 24 : 2 }}
            />
          </button>
        </div>

        <div className="mt-[18px] flex flex-col gap-[7px]">
          <div className="flex items-baseline justify-between gap-2.5">
            <Eyebrow>메뉴</Eyebrow>
            <span className="font-mono text-[11px] text-faint">{menuTotalLabel}</span>
          </div>

          <div className="flex flex-col gap-[7px]">
            {menus.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={m.name}
                  onChange={(e) => setMenuAt(i, { name: e.target.value })}
                  placeholder="먹은 것"
                  className="min-w-0 flex-1 rounded-[14px] border border-[#ded8cb] bg-card px-[14px] text-[14px] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick"
                  style={{ minHeight: 46 }}
                />
                <span className="relative flex w-24 shrink-0 items-center">
                  <input
                    value={m.price == null ? "" : m.price.toLocaleString("ko-KR")}
                    onChange={(e) => {
                      const raw = menuDigits(e.target.value);
                      setMenuAt(i, { price: raw ? Number(raw) : null });
                    }}
                    inputMode="numeric"
                    placeholder="0"
                    className="w-full rounded-[14px] border border-[#ded8cb] bg-card py-0 pr-6.5 pl-[11px] text-right font-mono text-[13px] text-ink outline-none focus:border-brick"
                    style={{ minHeight: 46 }}
                  />
                  <span className="pointer-events-none absolute right-[11px] text-[12px] text-[#a29a8c]">원</span>
                </span>
                {menus.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMenu(i)}
                    aria-label="이 메뉴 지우기"
                    className="grid h-[46px] w-[34px] shrink-0 cursor-pointer place-items-center border-none bg-transparent text-[15px] text-[#a29a8c] hover:text-[#9a4a52]"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addMenu}
            className="min-h-11 cursor-pointer rounded-[14px] border border-dashed border-[#cdc6b8] bg-transparent text-[13px] text-[#6b665e] hover:border-brick hover:text-brick"
          >
            + 메뉴 추가
          </button>
        </div>

        <label className="mt-3.5 block">
          <Eyebrow>메모</Eyebrow>
          <textarea
            rows={5}
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="그날 자리, 맛, 다시 올 이유"
            className="mt-[7px] w-full resize-none rounded-[14px] border border-[#ded8cb] bg-card px-3.5 py-3 font-serif text-[14.5px] leading-[1.8] text-[#2e2a25] outline-none placeholder:text-[#b3ada1] focus:border-brick"
          />
        </label>

        <div className="mt-[18px] flex flex-col gap-[9px]">
          <Eyebrow>키워드</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {KEYWORDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKeywords((p) => (p.includes(k) ? p.filter((v) => v !== k) : [...p, k]))}
                className={chipClass(keywords.includes(k))}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2.5 rounded-[18px] border border-dashed border-[#d8d3c8] px-4 py-3.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a8377" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="2.5" y="5.5" width="19" height="14" rx="3.5" />
            <circle cx="12" cy="12.5" r="4" />
            <path d="M8 5.5L9.4 3h5.2l1.4 2.5" />
          </svg>
          <span className="text-[11.5px] leading-[1.55] text-faint">
            사진은 그 자리에서 찍으면 인증 도장이 함께 붙습니다.
          </span>
        </div>

        {error && <p className="mt-3.5 text-[12.5px] text-[#a8412a]">{error}</p>}

        {canSave ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-[22px] w-full cursor-pointer rounded-[20px] border-none bg-ink p-4 text-[14.5px] font-medium text-card disabled:opacity-60"
          >
            {saveLabel}
          </button>
        ) : (
          <span className="mt-[22px] block w-full rounded-[20px] bg-[#e4dfd3] p-4 text-center text-[14.5px] text-faint">
            {saveLabel}
          </span>
        )}
      </div>
    </div>
  );
}

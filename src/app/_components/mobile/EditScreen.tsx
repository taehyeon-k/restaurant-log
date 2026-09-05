"use client";

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, type Kind, type MenuItem, type Restaurant } from "@/lib/types";
import { FELT_PRICE, feltLevel } from "@/lib/price";
import { forwardGeocode } from "@/lib/geocode";
import { regionFromAddress } from "@/lib/regions";
import { uploadPhoto } from "@/lib/photos";
import { photosOf } from "./record";
import { chipClass, Eyebrow, fieldClass, photoFill } from "./ui";

export type EditTarget =
  | { mode: "new"; kind: Kind }
  | { mode: "edit"; record: Restaurant };

const ALL_CATEGORIES = [...CATEGORIES.restaurant, ...CATEGORIES.cafe];
const RATINGS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 종류로 맛집/카페를 가릅니다 — 모바일에는 따로 탭이 없습니다. */
const kindOf = (category: string): Kind =>
  CATEGORIES.cafe.includes(category) ? "cafe" : "restaurant";

/**
 * 기록 수정 · 새 기록 쓰기. 같은 화면이고, 새 기록일 때만 위에 가게 정보가 붙습니다.
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

  const [name, setName] = useState(record?.name ?? "");
  const [category, setCategory] = useState(
    record?.category ?? (target.mode === "new" && target.kind === "cafe" ? "커피" : "한식")
  );
  const [region, setRegion] = useState(record?.region ?? "");
  const [address, setAddress] = useState(record?.address ?? "");

  const [photos, setPhotos] = useState<string[]>(record ? photosOf(record) : []);
  const [cover, setCover] = useState(record?.cover_index ?? 0);
  const [uploading, setUploading] = useState(false);

  const [visitedAt, setVisitedAt] = useState(record?.visited_at ?? today());
  const [rating, setRating] = useState(record?.rating ?? 0);
  const [menus, setMenus] = useState<MenuItem[]>(() => record?.menus?.length ? record.menus : (record?.menu ?? "").split(",").map((name) => ({ name: name.trim(), price: null })).filter((m) => m.name).concat([{ name: "", price: null }]).slice(0, Math.max(1, (record?.menu ?? "").split(",").filter((s) => s.trim()).length)));
  const [price, setPrice] = useState(record?.price_range == null ? "" : String(record.price_range));
  const menuTotal = menus.reduce((sum, m) => sum + (m.price ?? 0), 0);
  const setMenuAt = (i: number, patch: Partial<MenuItem>) => setMenus((p) => p.map((m, n) => n === i ? { ...m, ...patch } : m));
  const [review, setReview] = useState(record?.review ?? "");
  const [revisit, setRevisit] = useState(record?.revisit ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const priceNum = Number.parseInt(price, 10);
  const feltText = Number.isNaN(priceNum)
    ? "가격을 적으면 돼지로 보입니다"
    : FELT_PRICE[feltLevel({ price_level: null, price_range: priceNum }) - 1] ?? "";

  /** 같은 이름의 가게가 이미 있으면 좌표·주소를 물려받습니다. */
  const twin = useMemo(() => {
    if (!isNew) return null;
    const needle = name.trim();
    if (!needle) return null;
    return (
      rows.find((r) => r.name === needle && r.kind === kindOf(category)) ?? null
    );
  }, [isNew, name, category, rows]);

  async function addPhoto(file: File) {
    setUploading(true);
    setError("");
    try {
      const url = await uploadPhoto(file, file.name);
      setPhotos((p) => [...p, url].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다");
    }
    setUploading(false);
  }

  function removePhoto(i: number) {
    const next = photos.filter((_, k) => k !== i);
    setPhotos(next);
    setCover(cover >= next.length ? 0 : cover > i ? cover - 1 : cover);
  }

  const shared = () => ({
    rating: rating || null,
    menu: menus.map((m) => m.name.trim()).filter(Boolean).join(", ") || null,
    menus: menus.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), price: m.price })),
    price_range: menuTotal || (Number.isNaN(priceNum) ? null : priceNum),
    review: review.trim() || null,
    revisit,
    visited_at: visitedAt || null,
    photo_url: photos[cover] ?? photos[0] ?? null,
    photo_urls: photos,
    cover_index: Math.min(cover, Math.max(0, photos.length - 1)),
    updated_at: new Date().toISOString(),
  });

  async function save() {
    setError("");

    if (isNew && !name.trim()) {
      setError("가게 이름을 적어 주세요.");
      return;
    }

    setSaving(true);

    try {
      if (!isNew) {
        const { error } = await supabase
          .from("restaurants")
          .update(shared())
          .eq("id", record!.id);
        if (error) throw new Error(error.message);

        onSaved({ id: record!.id, kind: record!.kind });
        return;
      }

      const cleanName = name.trim();
      const cleanAddress = address.trim();
      const kind = kindOf(category);

      // 좌표: 같은 가게가 있으면 그 값, 없으면 주소·상호로 한 번 찾아봅니다.
      let lat = twin?.lat ?? null;
      let lng = twin?.lng ?? null;

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
      const finalRegion =
        region.trim() || twin?.region || regionFromAddress(finalAddress ?? "") || null;

      const { data, error } = await supabase
        .from("restaurants")
        .insert({
          kind,
          name: cleanName,
          category,
          region: finalRegion,
          address: finalAddress,
          place_key: `${cleanName}|${finalAddress ?? ""}`.toLowerCase(),
          keywords: [],
          price_level: null,
          lat,
          lng,
          verified: false,
          acc: null,
          ...shared(),
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

  return (
    <div className="absolute inset-0 z-[1300] flex flex-col bg-paper">
      <div
        className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[#e6e0d3] px-4 pb-3"
        style={{ paddingTop: "max(46px, calc(env(safe-area-inset-top) + 10px))" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer border-none bg-transparent px-1.5 text-[13px] text-faint"
        >
          취소
        </button>

        <div className="min-w-0 text-center">
          <div className="truncate font-serif text-[15px] font-bold">
            {isNew ? name.trim() || "새 기록" : record!.name}
          </div>
          <div className="mt-0.5 font-mono text-[9.5px] text-faint">
            {isNew ? "NEW" : `NO. ${String(record!.id).padStart(3, "0")}`}
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-11 cursor-pointer rounded-[18px] border-none bg-brick px-4 text-[13px] font-medium text-card disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-11">
        {isNew && (
          <div className="mb-[22px] flex flex-col gap-4">
            <label className="block">
              <Eyebrow>가게 이름</Eyebrow>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="어디에 갔나요"
                className={`${fieldClass} font-serif text-[16px]`}
              />
            </label>

            <div>
              <Eyebrow>종류</Eyebrow>
              <div className="mt-[9px] flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={chipClass(category === c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="block">
              <Eyebrow>지역 · 주소</Eyebrow>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="종로구"
                className={fieldClass}
              />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="서울 종로구 인사동길 12"
                className={`${fieldClass} text-[13px]`}
              />
            </div>

            <p className="text-[11.5px] leading-[1.7] text-faint">
              직접 쓴 기록에는 인증 마크가 붙지 않습니다. 사진을 그 자리에서 찍으면
              인증됩니다.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Eyebrow>사진 {photos.length} / 5</Eyebrow>
          {photos.length < 5 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="min-h-[38px] cursor-pointer rounded-[14px] border border-dashed border-line bg-transparent px-[13px] text-[11.5px] text-muted disabled:opacity-60"
            >
              {uploading ? "올리는 중…" : "사진 추가"}
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) addPhoto(file);
          }}
        />

        {photos.length > 0 && (
          <div className="mt-[11px] grid grid-cols-2 gap-[9px]">
            {photos.map((url, i) => (
              <div
                key={url}
                className={`relative h-28 overflow-hidden rounded-[16px] bg-[#eae5da] ${
                  i === cover ? "border-[1.5px] border-brick" : "border border-[#ded8cb]"
                }`}
                style={photoFill(url, category)}
              >
                <div className="absolute inset-x-0 bottom-0 flex border-t border-[#ded8cb]">
                  {i === cover ? (
                    <div className="grid min-h-[34px] flex-1 place-items-center bg-brick text-[10.5px] text-card">
                      대표사진
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCover(i)}
                      className="min-h-[34px] flex-1 cursor-pointer border-none bg-card text-[10.5px] text-muted"
                    >
                      대표로
                    </button>
                  )}
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label="사진 지우기"
                      className="min-h-[34px] w-[38px] shrink-0 cursor-pointer border-none border-l border-[#ded8cb] bg-card text-[11px] text-[#a29a8c]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-[22px] flex flex-col gap-4">
          <label className="block">
            <Eyebrow>방문일</Eyebrow>
            <input
              type="date"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
              className={`${fieldClass} font-mono`}
            />
          </label>

          <div>
            <Eyebrow>별점 {rating ? rating.toFixed(1) : "—"}</Eyebrow>
            <div className="mt-[9px] flex flex-wrap gap-1.5">
              {RATINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n === rating ? 0 : n)}
                  className={`min-h-[38px] cursor-pointer rounded-[14px] border px-3 font-mono text-[12px] ${
                    rating === n
                      ? "border-brick bg-brick text-card"
                      : "border-[#ded8cb] bg-card text-muted"
                  }`}
                >
                  {n.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between"><Eyebrow>메뉴</Eyebrow>{menuTotal > 0 && <span className="font-mono text-[11px] text-faint">{menus.filter((m) => m.name.trim()).length}개 · {menuTotal.toLocaleString("ko-KR")}원</span>}</div>
            <div className="mt-2 flex flex-col gap-2">
              {menus.map((m, i) => (
                <div key={i} className="flex min-h-[46px] items-center gap-1.5">
                  <input value={m.name} onChange={(e) => setMenuAt(i, { name: e.target.value })} placeholder="먹은 것" className="mt-0 min-h-12 min-w-0 flex-1 rounded-[16px] border border-[#ded8cb] bg-card px-[15px] text-[13.5px] text-ink outline-none focus:border-brick" />
                  <div className="relative w-24 shrink-0"><input inputMode="numeric" value={m.price == null ? "" : m.price.toLocaleString("ko-KR")} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 9); setMenuAt(i, { price: raw ? Number(raw) : null }); }} placeholder="가격" className="mt-0 min-h-12 w-full rounded-[16px] border border-[#ded8cb] bg-card px-[15px] pr-7 text-right font-mono text-[13px] text-ink outline-none focus:border-brick" /><span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-[#a29a8c]">원</span></div>
                  {menus.length > 1 && <button type="button" onClick={() => setMenus((p) => p.filter((_, n) => n !== i))} aria-label="메뉴 삭제" className="grid size-[34px] shrink-0 cursor-pointer place-items-center border-none bg-transparent text-[#a29a8c] hover:text-[#9a4a52]">✕</button>}
                </div>
              ))}
              <button type="button" onClick={() => setMenus((p) => [...p, { name: "", price: null }])} className="min-h-11 cursor-pointer border border-dashed border-[#cdc6b8] bg-transparent text-[12px] text-muted hover:border-brick hover:text-brick">+ 메뉴 추가</button>
            </div>
          </div>

          <label className="block">
            <Eyebrow>1인 기준 가격</Eyebrow>
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="15000"
              className={`${fieldClass} font-mono`}
            />
            <span className="mt-[7px] block text-[11.5px] text-faint">{feltText}</span>
          </label>

          <label className="block">
            <Eyebrow>메모</Eyebrow>
            <textarea
              rows={6}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="다음에 올 나를 위해"
              className="mt-2 w-full resize-none rounded-[16px] border border-[#ded8cb] bg-card px-[15px] py-[13px] font-serif text-[15px] leading-[1.8] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick"
            />
          </label>

          <div className="flex min-h-14 items-center justify-between border-y border-[#e6e0d3] py-3">
            <div><div className="text-[14px]">다시 오고 싶은 곳</div><div className="mt-1 text-[12px] text-[#8a8377]">{revisit ? "다시 갈 곳으로 표시됩니다 — 지도 핀도 색이 찹니다." : "켜면 목록의 재방문 필터와 지도 핀에 함께 반영됩니다."}</div></div>
            <button type="button" role="switch" aria-checked={revisit} aria-label="재방문 표시" onClick={() => setRevisit((v) => !v)} className={`relative h-6 w-11 shrink-0 rounded-full border-none ${revisit ? "bg-brick" : "bg-[#d8d3c8]"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white ${revisit ? "left-6" : "left-0.5"}`} /></button>
          </div>

          {error && <p className="text-[12.5px] text-[#a8412a]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

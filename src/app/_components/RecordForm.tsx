"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIES,
  KEYWORDS,
  type Kind,
  type MenuItem,
  type Restaurant,
} from "@/lib/types";
import { PRICE_HINTS } from "./PriceLevel";
import LocationPickerMap from "./LocationPickerMap";
import AddressSearch from "./AddressSearch";

/** 예전 기록은 menu 문자열만 있으니 이름만 채워 넣습니다. */
const initialMenus = (initial?: Restaurant): MenuItem[] => {
  if (initial?.menus?.length) return initial.menus;
  const names = (initial?.menu ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length
    ? names.map((name) => ({ name, price: null }))
    : [{ name: "", price: null }];
};

export default function RecordForm({ initial }: { initial?: Restaurant }) {
  const router = useRouter();
  const editing = Boolean(initial);

  const [kind, setKind] = useState<Kind>(initial?.kind ?? "restaurant");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(
    initial?.category ?? CATEGORIES.restaurant[0]
  );
  const [region, setRegion] = useState(initial?.region ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [rating, setRating] = useState(Math.floor(initial?.rating ?? 0));
  const [menus, setMenus] = useState<MenuItem[]>(initialMenus(initial));
  const [priceLevel, setPriceLevel] = useState(initial?.price_level ?? 0);
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [visitedAt, setVisitedAt] = useState(initial?.visited_at ?? "");
  const [revisit, setRevisit] = useState(initial?.revisit ?? false);
  const [review, setReview] = useState(initial?.review ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initial?.lng ?? null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLocationChange = useCallback((la: number, ln: number) => {
    setLat(la);
    setLng(ln);
  }, []);

  function switchKind(next: Kind) {
    setKind(next);
    setCategory(CATEGORIES[next][0]);
  }

  function toggleKeyword(k: string) {
    setKeywords((p) => (p.includes(k) ? p.filter((v) => v !== k) : [...p, k]));
  }

  const setMenuAt = (i: number, patch: Partial<MenuItem>) =>
    setMenus((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const addMenu = () => setMenus((p) => [...p, { name: "", price: null }]);
  const removeMenu = (i: number) =>
    setMenus((p) =>
      p.length === 1
        ? [{ name: "", price: null }]
        : p.filter((_, idx) => idx !== i)
    );

  async function uploadPhoto(file: File) {
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("restaurant-photos")
      .upload(path, file);
    if (error) throw new Error(error.message);
    return supabase.storage.from("restaurant-photos").getPublicUrl(path).data
      .publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    if (lat === null || lng === null) {
      setErrorMessage("지도에서 가게 위치를 선택하세요.");
      setLoading(false);
      return;
    }

    try {
      const photo_url = photo
        ? await uploadPhoto(photo)
        : initial?.photo_url ?? null;

      const cleanMenus = menus
        .map((m) => ({ name: m.name.trim(), price: m.price }))
        .filter((m) => m.name);

      const prices = cleanMenus
        .map((m) => m.price)
        .filter((p): p is number => typeof p === "number" && p > 0);

      const payload = {
        kind,
        name,
        category: category || null,
        region: region || null,
        address: address || null,
        rating: rating || null,
        menus: cleanMenus,
        menu: cleanMenus.map((m) => m.name).join(", ") || null,
        price_level: priceLevel || null,
        price_range: prices.length
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : null,
        review: review || null,
        keywords,
        revisit,
        visited_at: visitedAt || null,
        lat,
        lng,
        photo_url,
      };

      const { error } = initial
        ? await supabase
            .from("restaurants")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", initial.id)
        : await supabase.from("restaurants").insert(payload);

      if (error) throw new Error(error.message);

      router.push(initial ? `/?id=${initial.id}` : `/?kind=${kind}`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "저장에 실패했습니다");
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`"${initial.name}" 기록을 삭제할까요?`)) return;

    const { error } = await supabase
      .from("restaurants")
      .delete()
      .eq("id", initial.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex h-screen">
      <div className="relative flex-1 overflow-hidden bg-map">
        <LocationPickerMap
          center={lat !== null && lng !== null ? { lat, lng } : null}
          onChange={handleLocationChange}
        />

        <div className="absolute inset-x-0 top-0 z-[1000] flex items-center gap-5 p-8">
          <Link
            href="/"
             className="pr-1.5 font-serif text-[22px] font-bold tracking-[0.14em] whitespace-nowrap hover:text-brick"
          >
            DINARY
          </Link>

          <AddressSearch
            value={address}
            onChange={setAddress}
            onPick={(p) => {
              setLat(p.lat);
              setLng(p.lng);
              if (p.region && !region) setRegion(p.region);
            }}
          />
        </div>

        <div className="absolute bottom-7 left-8 z-[1000] rounded-[20px] border border-line bg-card/90 px-4 py-2.5 text-xs text-muted">
          {lat !== null && lng !== null
            ? `선택 위치: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
            : "주소를 검색하거나 지도를 클릭해 위치를 지정하세요"}
        </div>
      </div>

      <aside className="flex w-[560px] shrink-0 flex-col border-l border-line bg-paper">
        <div className="flex items-center justify-between px-8 pt-5.5">
          <Link
            href={initial ? `/?id=${initial.id}` : "/"}
            className="text-[13px] text-faint hover:text-brick"
          >
            ← {initial ? "기록으로" : "검색으로"}
          </Link>
          <div className="flex rounded-[22px] bg-[#eae5da] p-1">
            {(["restaurant", "cafe"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                className={`cursor-pointer rounded-[18px] px-6.5 py-2.25 text-sm font-medium transition-all ${
                  kind === k
                    ? "bg-ink text-paper"
                    : "bg-transparent text-muted hover:text-ink"
                }`}
              >
                {k === "restaurant" ? "맛집" : "카페"}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto px-8 pt-6.5 pb-10"
        >
          <h1 className="font-serif text-[34px] font-bold tracking-[-0.01em]">
            {editing ? "기록 수정" : "새 기록"}
          </h1>

          <Field label="NAME *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="가게 이름"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="CATEGORY">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                {CATEGORIES[kind].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="REGION">
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="중구"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="RATING">
            <div className="flex items-center gap-3.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n === rating ? 0 : n)}
                    className={`size-8.5 cursor-pointer rounded-[3px] border text-base transition-all ${
                      n <= rating
                        ? "border-brick bg-brick text-[#fdf9f3]"
                        : "border-line bg-card text-[#cdc6b8] hover:border-[#cdc6b8]"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <span className="font-mono text-[13px] text-muted">
                {rating ? `${rating.toFixed(1)} / 5.0` : "별점 없음"}
              </span>
            </div>
          </Field>

          <Field label="PRICE">
            <div className="flex items-center gap-3.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPriceLevel(n === priceLevel ? 0 : n)}
                    style={{
                      filter: n <= priceLevel ? "none" : "grayscale(1)",
                      opacity: n <= priceLevel ? 1 : 0.35,
                    }}
                    className={`size-8.5 cursor-pointer rounded-[3px] border text-base leading-none transition-all ${
                      n <= priceLevel
                        ? "border-brick bg-brick-soft"
                        : "border-line bg-card hover:border-[#cdc6b8]"
                    }`}
                  >
                    🐷
                  </button>
                ))}
              </div>
              <span className="text-[13px] text-muted">
                {priceLevel ? PRICE_HINTS[priceLevel] : "선택 안 함"}
              </span>
            </div>
          </Field>

          <Field label="MENU">
            <div className="flex flex-col gap-2">
              {menus.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={m.name}
                    onChange={(e) => setMenuAt(i, { name: e.target.value })}
                    placeholder={i === 0 ? "평양냉면" : "메뉴 이름"}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <input
                    type="number"
                    value={m.price ?? ""}
                    onChange={(e) =>
                      setMenuAt(i, {
                        price: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="가격"
                    className={`${inputClass} w-28 shrink-0 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => removeMenu(i)}
                    aria-label="메뉴 삭제"
                    className="size-11.5 shrink-0 cursor-pointer rounded-[3px] border border-line bg-card text-[#a8a196] transition-colors hover:border-brick hover:text-brick"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addMenu}
                className="h-10 cursor-pointer self-start rounded-[3px] border border-dashed border-[#cdc6b8] px-3.5 text-[13px] text-muted transition-colors hover:border-brick hover:text-brick"
              >
                + 메뉴 추가
              </button>
            </div>
          </Field>

          <Field label="VISITED AT">
            <input
              type="date"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label="KEYWORDS">
            <div className="flex flex-wrap gap-1.75">
              {KEYWORDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKeyword(k)}
                  className={`cursor-pointer rounded-[16px] border px-3.5 py-1.75 text-[12.5px] transition-all ${
                    keywords.includes(k)
                      ? "border-brick bg-brick text-[#fdf9f3]"
                      : "border-[#cdc6b8] bg-transparent text-[#4a453d] hover:border-ink"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>

          <Field label="PHOTO">
            <label className="flex h-37.5 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#cdc6b8] bg-card text-[13px] text-[#a8a196] hover:border-brick hover:text-brick">
              {photo ? (
                photo.name
              ) : initial?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={initial.photo_url}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                "사진을 선택하세요"
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </Field>

          <label className="flex cursor-pointer items-center gap-2.25 text-sm text-[#4a453d]">
            <input
              type="checkbox"
              checked={revisit}
              onChange={(e) => setRevisit(e.target.checked)}
              className="size-4 accent-brick"
            />
            다시 갈 것 같다
          </label>

          <Field label="REVIEW">
            <textarea
              rows={5}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="무엇이 좋았고, 다음엔 무엇을 먹을지"
              className="resize-none rounded-[3px] border border-line bg-card p-3.5 font-serif text-[15px] leading-[1.9] text-[#2e2a25] outline-none placeholder:text-[#b3ada1] focus:border-brick"
            />
          </Field>

          {errorMessage && <p className="text-[13px] text-brick">{errorMessage}</p>}

          <div className="mt-1 flex gap-2.5">
            <button
              disabled={loading}
              className="h-12.5 flex-1 cursor-pointer rounded-[25px] bg-ink text-sm font-medium text-paper transition-colors hover:bg-brick disabled:opacity-50"
            >
              {loading ? "저장 중…" : editing ? "저장" : "기록 저장"}
            </button>
            <Link
              href={initial ? `/?id=${initial.id}` : "/"}
              className="flex h-12.5 w-32 items-center justify-center rounded-[25px] border border-[#cdc6b8] text-sm"
            >
              취소
            </Link>
          </div>

          {editing && (
            <button
              type="button"
              onClick={handleDelete}
              className="mt-2 h-11 cursor-pointer self-start text-[13px] text-[#a8a196] underline-offset-4 transition-colors hover:text-brick hover:underline"
            >
              이 기록 삭제
            </button>
          )}
        </form>
      </aside>
    </main>
  );
}

const inputClass =
  "h-11.5 rounded-[3px] border border-line bg-card px-3.5 text-sm outline-none placeholder:text-[#b3ada1] focus:border-brick";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="eyebrow">{label}</label>
      {children}
    </div>
  );
}

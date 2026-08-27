"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, KEYWORDS, type Kind } from "@/lib/types";

export default function AddRestaurantPage() {
  const router = useRouter();

  const [kind, setKind] = useState<Kind>("restaurant");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES.restaurant[0]);
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [rating, setRating] = useState(0);
  const [menu, setMenu] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [visitedAt, setVisitedAt] = useState("");
  const [revisit, setRevisit] = useState(false);
  const [review, setReview] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function switchKind(next: Kind) {
    setKind(next);
    setCategory(CATEGORIES[next][0]);
  }

  function toggleKeyword(k: string) {
    setKeywords((prev) =>
      prev.includes(k) ? prev.filter((v) => v !== k) : [...prev, k]
    );
  }

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

    try {
      const photo_url = photo ? await uploadPhoto(photo) : null;

      const { error } = await supabase.from("restaurants").insert({
        kind,
        name,
        category: category || null,
        region: region || null,
        address: address || null,
        rating: rating || null,
        menu: menu || null,
        price_range: priceRange ? Number(priceRange) : null,
        review: review || null,
        keywords,
        revisit,
        visited_at: visitedAt || null,
        photo_url,
      });

      if (error) throw new Error(error.message);

      router.push(`/?kind=${kind}`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "저장에 실패했습니다");
      setLoading(false);
    }
  }

  return (
    <main className="flex h-screen">
      {/* left: location picker — same plate as the search map */}
      <div className="relative flex-1 overflow-hidden bg-map">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-map-grid) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="absolute -left-[6%] top-[22%] h-11 w-[112%] -rotate-7 bg-map-road" />
        <div className="absolute -left-[6%] top-[64%] h-[30px] w-[112%] rotate-4 bg-map-road" />
        <div className="absolute left-[34%] -top-[10%] h-[120%] w-[34px] rotate-9 bg-map-road" />
        <div className="absolute left-[8%] top-[74%] h-[22%] w-[30%] rounded-[14px] bg-map-park" />

        <div className="absolute left-[46%] top-[48%] -translate-x-1/2 -translate-y-full rounded-[14px_14px_14px_3px] bg-brick px-3.75 pt-2.5 pb-2.25 text-[#fdf9f3] shadow-[0_10px_24px_rgba(180,85,45,0.3)]">
          <span className="block text-[13px] font-medium whitespace-nowrap">
            {name || "위치 미지정"}
          </span>
          <span className="block font-mono text-[11px] opacity-70">
            37.5665, 126.9780
          </span>
        </div>

        <div className="absolute inset-x-0 top-0 flex items-center gap-5 p-8">
          <Link
            href="/"
            className="pr-1.5 font-serif text-[21px] font-bold tracking-[0.02em] whitespace-nowrap hover:text-brick"
          >
            오늘의 식탁
          </Link>
          <div className="flex h-12 flex-1 items-center gap-3 rounded-[26px] border border-line bg-card px-4.5 shadow-[0_6px_18px_rgba(28,26,23,0.07)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--color-faint)"
              strokeWidth="1.6"
            >
              <circle cx="7" cy="7" r="4.6" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="주소를 검색해 위치를 지정하세요"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#b3ada1]"
            />
          </div>
        </div>

        <div className="absolute bottom-7 left-8 rounded-[20px] border border-line bg-card/90 px-4 py-2.5 text-xs text-muted">
          지도를 클릭해 핀 위치를 조정할 수 있습니다
        </div>
      </div>

      {/* right: form */}
      <aside className="flex w-[560px] shrink-0 flex-col border-l border-line bg-paper">
        <div className="flex items-center justify-between px-8 pt-5.5">
          <Link href="/" className="text-[13px] text-faint hover:text-brick">
            ← 검색으로
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
            새 기록
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

          <div className="grid grid-cols-[1.4fr_1fr] gap-3.5">
            <Field label="MENU">
              <input
                value={menu}
                onChange={(e) => setMenu(e.target.value)}
                placeholder="평양냉면, 제육"
                className={inputClass}
              />
            </Field>
            <Field label="PRICE">
              <input
                type="number"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                placeholder="12000"
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>

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
            <label className="flex h-37.5 cursor-pointer items-center justify-center border border-dashed border-[#cdc6b8] bg-card text-[13px] text-[#a8a196] hover:border-brick hover:text-brick">
              {photo ? photo.name : "사진을 선택하세요"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </Field>

          <div className="grid grid-cols-2 items-end gap-3.5">
            <Field label="VISITED AT">
              <input
                type="date"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <label className="flex h-11.5 cursor-pointer items-center gap-2.25 text-sm text-[#4a453d]">
              <input
                type="checkbox"
                checked={revisit}
                onChange={(e) => setRevisit(e.target.checked)}
                className="size-4 accent-brick"
              />
              다시 갈 것 같다
            </label>
          </div>

          <Field label="REVIEW">
            <textarea
              rows={5}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="무엇이 좋았고, 다음엔 무엇을 먹을지"
              className="resize-none rounded-[3px] border border-line bg-card p-3.5 font-serif text-[15px] leading-[1.9] text-[#2e2a25] outline-none placeholder:text-[#b3ada1] focus:border-brick"
            />
          </Field>

          {errorMessage && (
            <p className="text-[13px] text-brick">{errorMessage}</p>
          )}

          <div className="mt-1 flex gap-2.5">
            <button
              disabled={loading}
              className="h-12.5 flex-1 cursor-pointer rounded-[25px] bg-ink text-sm font-medium text-paper transition-colors hover:bg-brick disabled:opacity-50"
            >
              {loading ? "저장 중…" : "기록 저장"}
            </button>
            <Link
              href="/"
              className="flex h-12.5 w-32 items-center justify-center rounded-[25px] border border-[#cdc6b8] text-sm"
            >
              취소
            </Link>
          </div>
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

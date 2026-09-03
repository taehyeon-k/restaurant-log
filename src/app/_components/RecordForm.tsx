"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIES,
  KEYWORDS,
  type Kind,
  type MenuItem,
  type Restaurant,
} from "@/lib/types";
import { FELT_PRICE } from "@/lib/price";
import { reverseGeocode } from "@/lib/geocode";
import LocationPickerMap from "./LocationPickerMap";
import AddressSearch from "./AddressSearch";
import RegionSelect from "./RegionSelect";
import { regionFromAddress } from "@/lib/regions";
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

  // 지도 검색에서 넘어온 값 (새 기록일 때만)
  const sp = useSearchParams();
  const presetName = initial ? "" : sp.get("name") ?? "";
  const presetAddress = initial ? "" : sp.get("address") ?? "";
  const presetLat = initial || !sp.get("lat") ? null : Number(sp.get("lat"));
  const presetLng = initial || !sp.get("lng") ? null : Number(sp.get("lng"));

  const [kind, setKind] = useState<Kind>(initial?.kind ?? "restaurant");
  const [name, setName] = useState(initial?.name ?? presetName);
  const [category, setCategory] = useState(
    initial?.category ?? CATEGORIES.restaurant[0]
  );
  const [region, setRegion] = useState(initial?.region ?? "");
  // 직접 고른 적이 있으면 자동 입력이 덮어쓰지 않습니다.
  const [regionTouched, setRegionTouched] = useState(Boolean(initial?.region));
  const [address, setAddress] = useState(initial?.address ?? presetAddress);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [menus, setMenus] = useState<MenuItem[]>(initialMenus(initial));
  const [priceLevel, setPriceLevel] = useState(initial?.price_level ?? 0);
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [visitedAt, setVisitedAt] = useState(initial?.visited_at ?? "");
  const [revisit, setRevisit] = useState(initial?.revisit ?? false);
  const [review, setReview] = useState(initial?.review ?? "");
  const [photos, setPhotos] = useState<string[]>(
  initial?.photo_urls?.length
    ? initial.photo_urls
    : initial?.photo_url
      ? [initial.photo_url]
      : []
);
const [cover, setCover] = useState(initial?.cover_index ?? 0);
const [uploading, setUploading] = useState(false);
  const [lat, setLat] = useState<number | null>(initial?.lat ?? presetLat);
  const [lng, setLng] = useState<number | null>(initial?.lng ?? presetLng);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 주소가 어디서 채워지든(장소 검색·지도 클릭·직접 입력) 지역이 따라옵니다.
useEffect(() => {
  if (regionTouched) return;
  const derived = regionFromAddress(address);
  if (derived && derived !== region) setRegion(derived);
}, [address, region, regionTouched]);
  // 지도를 클릭하거나 핀을 옮기면 주소와 지역을 되찾아옵니다.
  const handleLocationChange = useCallback(async (la: number, ln: number) => {
    setLat(la);
    setLng(ln);

    const hit = await reverseGeocode(la, ln).catch(() => null);
    if (!hit) return;

    setAddress(hit.address);
  
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
        menu:
          cleanMenus
           .map((m) =>
            m.price ? `${m.name} ${m.price.toLocaleString("ko-KR")}원` : m.name
            )
           .join(", ") || null,
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
        photo_url: photos[cover] ?? null,   // 예전 칸도 대표사진으로 채워둡니다
        photo_urls: photos,
        cover_index: Math.min(cover, Math.max(0, photos.length - 1)),
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
          category={category}
          revisit={revisit}
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
          
            <Field label="CATEGORY">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${inputClass} w-1/2`}
            >
              {CATEGORIES[kind].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="REGION">
  {!regionTouched && region ? (
    <div className="flex items-center justify-between gap-3 rounded-[3px] border border-line bg-card px-3.5 py-3 text-sm">
      <span>{region}</span>
      <button
        type="button"
        onClick={() => setRegionTouched(true)}
        className="cursor-pointer font-mono text-[11px] tracking-[0.08em] text-faint hover:text-brick"
      >
        직접 고르기
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <RegionSelect
        value={region}
        onChange={(v) => {
          setRegionTouched(true);
          setRegion(v);
        }}
      />
      {regionFromAddress(address) && (
        <button
          type="button"
          onClick={() => {
            setRegionTouched(false);
            setRegion(regionFromAddress(address));
          }}
          className="cursor-pointer self-start font-mono text-[11px] tracking-[0.08em] text-faint hover:text-brick"
        >
          주소 기준으로 다시 채우기
        </button>
      )}
    </div>
  )}
</Field>

          <Field label="ADDRESS">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="위치를 정하면 채워집니다"
              className={inputClass}
            />
          </Field>

          <Field label="RATING">
            <div className="flex items-center gap-3.5">
              {/* 별 하나의 왼쪽 절반 = n-0.5, 오른쪽 절반 = n. 같은 값을 다시 누르면 해제. */}
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const fill = Math.max(0, Math.min(1, rating - (n - 1)));
                  const pick = (v: number) => () =>
                    setRating(v === rating ? 0 : v);

                  return (
                    <div
                      key={n}
                      className="relative size-7.5 text-[28px] leading-7.5"
                    >
                      <span className="absolute inset-0 text-[#dcd6ca]">★</span>
                      <span
                        className="absolute top-0 left-0 overflow-hidden whitespace-nowrap text-brick"
                        style={{ width: `${fill * 100}%` }}
                      >
                        ★
                      </span>
                      <button
                        type="button"
                        onClick={pick(n - 0.5)}
                        aria-label={`${n - 0.5}점`}
                        className="absolute top-0 left-0 h-full w-1/2 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={pick(n)}
                        aria-label={`${n}점`}
                        className="absolute top-0 right-0 h-full w-1/2 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
              <span className="font-mono text-[13px] text-muted">
                {rating ? `${rating.toFixed(1)} / 5.0` : "별점 없음"}
              </span>
            </div>
          </Field>

          <Field label="FELT PRICE 체감 가격">
            <div className="flex items-center gap-3.5">
              {/* 검색 목록과 같은 척도. 고른 칸까지만 색이 들어옵니다. */}
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPriceLevel(n === priceLevel ? 0 : n)}
                    aria-label={`${n}단계 · ${FELT_PRICE[n - 1]}`}
                    className="size-8.5 cursor-pointer border-none bg-transparent p-0 leading-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/piggy.png"
                      alt=""
                      className={`block size-8.5 object-contain transition-[opacity,filter] duration-150 ${
                        n <= priceLevel
                          ? "opacity-100"
                          : "opacity-30 grayscale-[0.85]"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-[13.5px] text-[#4a453d]">
                {priceLevel ? FELT_PRICE[priceLevel - 1] : "아직 고르지 않음"}
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

          <Field label="PHOTO 최대 5장">
  <div className="grid grid-cols-3 gap-2.5">
    {photos.map((url, i) => (
      <div
        key={url}
        className={`relative h-26 ${i === cover ? "border-[1.5px] border-brick" : "border border-[#ded8cb]"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="size-full object-cover" />

        {i === cover ? (
          <span className="absolute top-1.5 left-1.5 bg-ink px-1.75 py-0.75 text-[10px] text-paper">
            대표
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCover(i)}
            className="absolute top-1.5 left-1.5 cursor-pointer border border-[#cdc6b8] bg-card/90 px-1.75 py-0.75 text-[10px] text-[#4a453d] hover:border-brick hover:text-brick"
          >
            대표로
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            const next = photos.filter((_, k) => k !== i);
            setPhotos(next);
            if (cover >= next.length) setCover(0);
          }}
          aria-label="사진 삭제"
          className="absolute top-1.5 right-1.5 size-5 cursor-pointer border border-[#cdc6b8] bg-card/90 text-xs text-muted hover:border-[#9a4a52] hover:text-[#9a4a52]"
        >
          ×
        </button>
      </div>
    ))}

    {photos.length < 5 && (
      <label className="flex h-26 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-[#cdc6b8] text-[12px] text-[#a8a196] hover:border-brick hover:text-brick">
        <span className="text-lg leading-none">+</span>
        <span>{uploading ? "올리는 중…" : "사진 추가"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const url = await uploadPhoto(file);
              setPhotos((p) => [...p, url].slice(0, 5));
            } catch (err) {
              setErrorMessage(
                err instanceof Error ? err.message : "사진 업로드 실패"
              );
            }
            setUploading(false);
          }}
        />
      </label>
    )}
  </div>
  <p className="text-[12px] text-[#a8a196]">
    대표 사진은 목록과 기록 화면에 크게 표시됩니다.
  </p>
</Field>

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

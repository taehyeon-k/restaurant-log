"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { groupPlaces, type Place } from "@/lib/places";
import { dottedDate, matchWish, wishKind, type Kind, type Restaurant, type Sort, type Wish } from "@/lib/types";
import type { Place as GeocodePlace } from "@/lib/geocode";
import MobileMap, { type MapHandle, type MarkerFilter } from "./MobileMap";
import PlaceCard from "./PlaceCard";
import FilterSheet from "./FilterSheet";
import PlaceScreen from "./PlaceScreen";
import RecordScreen from "./RecordScreen";
import EditScreen, { type EditTarget } from "./EditScreen";
import CaptureFlow, { type Verified } from "./CaptureFlow";
import LabelBook from "./LabelBook";
import DraftsScreen from "./DraftsScreen";
import CalendarScreen from "./CalendarScreen";
import DayScreen from "./DayScreen";
import TabBar, { type Tab } from "./TabBar";
import MobilePlaceSearch, { type PickedPlace } from "./PlaceSearch";
import WishScreen from "./WishScreen";
import WishForm, { type WishFormTarget } from "./WishForm";
import WishSheet from "./WishSheet";
import SearchMissSheet from "./SearchMissSheet";
import { BookmarkIcon, BURST, DraftsBoxIcon, Eyebrow, PlusIcon, SearchIcon } from "./ui";

/** 이미 기록한 가게인지 — 이름이 같거나, 150m 안에 있으면 같은 곳으로 봅니다. */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

/** 시트가 멈추는 높이. 화면이 낮으면 그만큼 줄여 잡습니다. */
const SNAP_MAX = { peek: 192, half: 462, full: 668 };
const ORDER = ["peek", "half", "full"] as const;
export type Snap = (typeof ORDER)[number];

/** 상태바를 피해 앉는 위치 — 노치가 없으면 디자인 값 그대로 50px. */
export const SAFE_TOP = "max(50px, calc(env(safe-area-inset-top) + 8px))";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "최근순" },
  { value: "rating", label: "별점순" },
  { value: "price", label: "가격순" },
];

const uniq = (list: (string | null | undefined)[]) => [
  ...new Set(list.filter((v): v is string => !!v)),
];

const EASE = "cubic-bezier(.32,.72,0,1)";

export default function MobileShell({ rows, wishes }: { rows: Restaurant[]; wishes: Wish[] }) {
  const router = useRouter();

  const [kind, setKind] = useState<Kind>("restaurant");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [pickedPlace, setPickedPlace] = useState<PickedPlace>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null);

  const [placeKey, setPlaceKey] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [flow, setFlow] = useState(false);
  /** 「방문 인증」으로 촬영을 시작했을 때 인증 대상 위시 id(HANDOFF-verify.md §3). */
  const [verifyWishId, setVerifyWishId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [draftsOpen, setDraftsOpen] = useState(false);
  /** 월력에서 연 날짜 — 있는 동안은 그날 화면(DayScreen)이 떠 있습니다. */
  const [day, setDay] = useState<string | null>(null);

  /** 가고싶다 — 담기/고치기 시트, 지도에서 책갈피를 눌러 연 시트, 마커 필터. */
  const [wishFormTarget, setWishFormTarget] = useState<WishFormTarget | null>(null);
  const [openWishId, setOpenWishId] = useState<string | null>(null);
  const [markerFilter, setMarkerFilter] = useState<MarkerFilter>("all");
  /** + 단추가 두 갈래(기록 추가 / 계획 추가)로 펼쳐져 있는지. */
  const [plusOpen, setPlusOpen] = useState(false);
  /** 지도 검색에서 이미 있는 가게를 찾았을 때의 작은 시트(§9). */
  const [foundHit, setFoundHit] = useState<{ restaurant: Restaurant; place: Place } | null>(null);

  const mapRef = useRef<MapHandle>(null);

  /* ── 화면 높이에 맞춘 스냅 ─────────────────────────── */

  const [vh, setVh] = useState(844);

  useEffect(() => {
    const read = () => setVh(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const snaps = useMemo(
    () => ({
      peek: Math.min(SNAP_MAX.peek, Math.max(120, vh - 260)),
      half: Math.min(SNAP_MAX.half, Math.max(200, vh - 200)),
      full: Math.min(SNAP_MAX.full, Math.max(260, vh - 84)),
    }),
    [vh]
  );

  const sheetH = dragH ?? snaps[snap];

  // 스냅이 바뀌면 지도가 새 크기를 다시 잽니다.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidate(), 280);
    return () => clearTimeout(t);
  }, [snap]);

  /* ── 데이터 ────────────────────────────────────── */

  /** 작성 전(pending) 기록 — 보관함에만 보이고, 목록·지도·필터에는 넘기지 않습니다. */
  const pendingRows = useMemo(() => rows.filter((r) => r.pending), [rows]);
  const visibleRows = useMemo(() => rows.filter((r) => !r.pending), [rows]);

  const placesByKind = useMemo(
    () => ({
      restaurant: groupPlaces(visibleRows.filter((r) => r.kind === "restaurant")),
      cafe: groupPlaces(visibleRows.filter((r) => r.kind === "cafe")),
    }),
    [visibleRows]
  );

  const inKind = useMemo(
    () => visibleRows.filter((r) => r.kind === kind),
    [visibleRows, kind]
  );
  const allPlaces = placesByKind[kind];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const hit = (p: Place) =>
      !needle ||
      [p.name, p.region, p.category, p.address].some((f) =>
        (f ?? "").toLowerCase().includes(needle)
      ) ||
      p.visits.some((v) =>
        [v.menu, v.review].some((f) => (f ?? "").toLowerCase().includes(needle))
      );

    const list = allPlaces
      .filter((p) => !categories.length || categories.includes(p.category ?? ""))
      .filter((p) => !keywords.length || p.keywords.some((k) => keywords.includes(k)))
      .filter((p) => !revisitOnly || p.revisit)
      .filter((p) => !verifiedOnly || p.verified)
      .filter(hit);

    return [...list].sort((a, b) => {
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === "price") return (a.price_range ?? 0) - (b.price_range ?? 0);
      return (a.latest.visited_at ?? "") < (b.latest.visited_at ?? "") ? 1 : -1;
    });
  }, [allPlaces, q, categories, keywords, revisitOnly, verifiedOnly, sort]);

  const place = placeKey ? allPlaces.find((p) => p.key === placeKey) ?? null : null;
  const visit = visitId != null ? rows.find((r) => r.id === visitId) ?? null : null;
  const visitPlace = visit
    ? placesByKind[visit.kind].find((p) => p.visits.some((v) => v.id === visit.id)) ?? null
    : null;

  const activeFilters =
    categories.length + keywords.length + (revisitOnly ? 1 : 0) + (verifiedOnly ? 1 : 0);

  /* ── 열기 ─────────────────────────────────────── */

  const openPlace = useCallback(
    (key: string, k: Kind = kind) => {
      const target = placesByKind[k].find((p) => p.key === key);
      if (!target) return;

      setKind(k);
      setPlaceKey(key);
      setVisitId(target.visits.length === 1 ? target.visits[0].id : null);
    },
    [kind, placesByKind]
  );

  const closeAll = useCallback(() => {
    setPlaceKey(null);
    setVisitId(null);
  }, []);

  const refresh = useCallback(() => router.refresh(), [router]);

  /* ── 지도 검색 (PC 의 PlaceSearch 와 같은 방식) ──────── */

  /** 이미 기록한 가게인지 — 이름이 같거나, 150m 안에 있으면 같은 곳으로 봅니다. */
  function findRecord(p: GeocodePlace): Restaurant | null {
    const needle = norm(p.name || "");

    if (needle) {
      const byName = visibleRows.find((r) => {
        const n = norm(r.name);
        return n === needle || n.includes(needle) || needle.includes(n);
      });
      if (byName) return byName;
    }

    return (
      visibleRows.find(
        (r) =>
          r.lat !== null &&
          r.lng !== null &&
          metersBetween(r.lat, r.lng, p.lat, p.lng) < 150
      ) ?? null
    );
  }

  /** 이미 담아둔 위시인지 — 이름이 같거나, 150m 안에 있으면 같은 곳으로 봅니다(§10). */
  function findWish(p: GeocodePlace): Wish | null {
    const needle = norm(p.name || "");

    if (needle) {
      const byName = wishes.find((w) => {
        const n = norm(w.name);
        return n === needle || n.includes(needle) || needle.includes(n);
      });
      if (byName) return byName;
    }

    return (
      wishes.find(
        (w) => w.lat !== null && w.lng !== null && metersBetween(w.lat, w.lng, p.lat, p.lng) < 150
      ) ?? null
    );
  }

  /** 이 가게로 새 방문을 이어받아 엽니다(§8, §9) — 취소하면 그냥 아무 일도 없던 게 됩니다. */
  const openRevisit = useCallback((source: Restaurant) => {
    setEditing({
      mode: "new",
      kind: source.kind,
      preset: {
        name: source.name,
        address: source.address ?? undefined,
        lat: source.lat ?? undefined,
        lng: source.lng ?? undefined,
        category: source.category ?? undefined,
        revisit: true,
      },
    });
  }, []);

  /**
   * 예정으로 담습니다(§9) — 이미 같은 이름의 위시가 있으면 새로 만들지 않고
   * 그 위시 시트를 곧바로 엽니다(중복 방지, WISH MET 유령 위시를 막습니다).
   */
  const openWishPlan = useCallback(
    (preset: { name: string; where_text?: string; category?: string; lat?: number; lng?: number }) => {
      const dup = matchWish(wishes, preset.name);
      if (dup) {
        setOpenWishId(dup.id);
        return;
      }
      setWishFormTarget({ mode: "new", preset });
    },
    [wishes]
  );

  /** 「방문 인증」/「여기 왔어요 · 사진 찍기」 — 이 위시를 인증 대상으로 들고 카메라를 켭니다(§2, §3). */
  const startVerify = useCallback((wish: Wish) => {
    setOpenWishId(null);
    setKind(wishKind(wish));
    setVerifyWishId(wish.id);
    setFlow(true);
  }, []);

  function handleChoosePlace(p: GeocodePlace) {
    const hit = findRecord(p);

    if (hit) {
      setPickedPlace(null);
      const target = placesByKind[hit.kind].find((pl) =>
        pl.visits.some((v) => v.id === hit.id)
      );
      if (target) {
        if (target.lat != null && target.lng != null) {
          mapRef.current?.flyTo(target.lat, target.lng, 16);
        }
        // 곧바로 들어가지 않고 작은 시트로 먼저 보여줍니다 — 지도를 누르면 그 자리에 그대로 머무릅니다.
        setFoundHit({ restaurant: hit, place: target });
      }
      return;
    }

    // 기록에 없으면 위시에서 찾습니다 — 담아둔 곳을 검색했는데 "어느 쪽에도 없다"고
    // 말하며 중복 담기를 권하면 안 됩니다(§10).
    const wishHit = findWish(p);
    if (wishHit) {
      closeAll();
      setPickedPlace(null);
      if (wishHit.lat != null && wishHit.lng != null) {
        mapRef.current?.flyTo(wishHit.lat, wishHit.lng, 16);
      } else {
        mapRef.current?.flyTo(p.lat, p.lng, 16);
      }
      setOpenWishId(wishHit.id);
      return;
    }

    closeAll();
    setPickedPlace({ name: p.name || p.address, address: p.address, lat: p.lat, lng: p.lng });
    mapRef.current?.flyTo(p.lat, p.lng, 16);
  }

  /* ── 시트 끌기 ─────────────────────────────────── */

  function onHandleDown(e: React.PointerEvent) {
    const y0 = e.clientY;
    const h0 = snaps[snap];
    let moved = false;

    const move = (ev: PointerEvent) => {
      const next = h0 - (ev.clientY - y0);
      if (Math.abs(ev.clientY - y0) > 6) moved = true;
      setDragH(Math.max(120, Math.min(snaps.full + 20, next)));
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragH(null);

      if (!moved) {
        setSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]);
        return;
      }

      const h = Math.max(120, Math.min(snaps.full + 20, h0 - (ev.clientY - y0)));
      setSnap(
        ORDER.reduce((a, b) =>
          Math.abs(snaps[b] - h) < Math.abs(snaps[a] - h) ? b : a
        )
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /* ── 인증 흐름이 남긴 기록 ──────────────────────── */

  function afterVerified({ record, writeNow }: Verified) {
    setFlow(false);
    setVerifyWishId(null);
    refresh();
    setKind(record.kind);
    setSnap("half");

    if (writeNow) {
      setPlaceKey(null);
      setVisitId(record.id);
      setEditing({ mode: "edit", record });
    } else {
      closeAll();
    }
  }

  const overlayOpen =
    editing !== null ||
    flow ||
    labelsOpen ||
    draftsOpen ||
    tab !== "map" ||
    wishFormTarget !== null ||
    openWishId !== null ||
    foundHit !== null ||
    pickedPlace !== null;

  const TAB_TITLE: Record<Exclude<Tab, "map" | "calendar" | "wish">, string> = {
    account: "내계정",
  };

  const openWish = openWishId ? wishes.find((w) => w.id === openWishId) ?? null : null;

  return (
    <div className="relative h-dvh overflow-hidden bg-map">
      <MobileMap
        ref={mapRef}
        places={filtered}
        selectedKey={placeKey}
        onSelect={(key) => openPlace(key)}
        frozen={overlayOpen}
        ghost={pickedPlace}
        onGhostClick={() =>
          pickedPlace &&
          setEditing({
            mode: "new",
            kind,
            preset: { name: pickedPlace.name, address: pickedPlace.address, lat: pickedPlace.lat, lng: pickedPlace.lng },
          })
        }
        wishes={wishes}
        markerFilter={markerFilter}
        onSelectWish={(id) => setOpenWishId(id)}
      />

      {/* 마커 필터 — 지도 왼쪽 아래, 시트를 따라 함께 올라갑니다(§5). */}
      <div
        className="absolute left-4 z-[1000] flex items-center gap-[3px] rounded-[18px] border border-[#d8d3c8] p-[3px]"
        style={{
          background: "rgba(251,250,246,.95)",
          bottom: Math.min(sheetH + 74 + 14, 700),
          transition: `bottom .26s ${EASE}`,
        }}
      >
        {(
          [
            { id: "all", label: "둘 다" },
            { id: "visited", label: "기록만" },
            { id: "wish", label: "가고싶다만" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setMarkerFilter(f.id)}
            className={`min-h-[30px] cursor-pointer rounded-[15px] px-[11px] text-[11.5px] ${
              markerFilter === f.id ? "border-none bg-brick text-card" : "border-none bg-transparent text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 위쪽을 눕히는 종이색 그라데이션 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[900] h-26"
        style={{
          background:
            "linear-gradient(rgba(246,243,236,.96), rgba(246,243,236,0))",
        }}
      />

      {/* 지도 검색줄 + 라벨첩 */}
      <div
        className="absolute inset-x-4 z-[1000] flex items-start gap-[9px]"
        style={{ top: SAFE_TOP }}
      >
        <MobilePlaceSearch
          value={mapQuery}
          onChange={setMapQuery}
          onChoose={handleChoosePlace}
          picked={pickedPlace}
          onClearPicked={() => setPickedPlace(null)}
        />

        <button
          type="button"
          onClick={() => setLabelsOpen(true)}
          aria-label="라벨첩"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-card shadow-[0_4px_14px_rgba(28,26,23,.08)]"
        >
          <span
            className="block size-[18px] bg-brick"
            style={{ clipPath: BURST }}
          />
        </button>
      </div>

      {/* 보관함 — 예전 카메라 FAB 자리, 이제 카메라는 하단 바 가운데로 옮겼습니다 */}
      <button
        type="button"
        onClick={() => setDraftsOpen(true)}
        aria-label="보관함"
        className="absolute right-4 z-[1000] grid size-14 cursor-pointer place-items-center rounded-full border border-line bg-card shadow-[0_6px_18px_rgba(28,26,23,.16)] hover:border-brick"
        style={{
          bottom: Math.min(sheetH + 74 + 14, 700),
          transition: `bottom .26s ${EASE}`,
        }}
      >
        <DraftsBoxIcon />
        {pendingRows.length > 0 && (
          <span
            className="absolute -top-[3px] -right-[3px] grid min-w-[21px] place-items-center rounded-[11px] border-2 border-paper bg-brick px-[5px] font-mono text-[10.5px] leading-none text-card"
            style={{ height: 21 }}
          >
            {pendingRows.length}
          </span>
        )}
      </button>

      {/* + 단추 — 두 갈래: 기록 추가(인증 없이 직접 쓰기) / 계획 추가(위시, §5) */}
      {plusOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setPlusOpen(false)}
          className="absolute inset-0 z-[999] cursor-default border-none bg-transparent"
        />
      )}

      {plusOpen && (
        <div
          className="absolute right-4 z-[1000] flex flex-col items-end gap-2"
          style={{
            bottom: Math.min(sheetH + 74 + 16, 702) + 60,
            transition: `bottom .26s ${EASE}`,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              setEditing({ mode: "new", kind });
            }}
            className="flex min-h-[46px] cursor-pointer items-center gap-2 rounded-[16px] border-none bg-card px-4 shadow-[0_6px_16px_rgba(28,26,23,.14)]"
          >
            <span className="block size-[22px] shrink-0 rounded-full border-[1.5px] border-[#8a8377]" />
            <span className="text-[13px] whitespace-nowrap text-ink">기록 추가</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              setWishFormTarget({ mode: "new" });
            }}
            className="flex min-h-[46px] cursor-pointer items-center gap-2 rounded-[16px] border-none bg-card px-4 shadow-[0_6px_16px_rgba(28,26,23,.14)]"
          >
            <BookmarkIcon size={20} stroke="#1c1a17" />
            <span className="text-[13px] whitespace-nowrap text-ink">계획 추가</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPlusOpen((v) => !v)}
        aria-label="기록·계획 추가"
        className={`absolute right-[84px] z-[1000] grid size-13 cursor-pointer place-items-center rounded-full ${
          plusOpen
            ? "border-none bg-brick shadow-[0_8px_20px_rgba(180,85,45,.34)]"
            : "border border-line bg-card shadow-[0_6px_16px_rgba(28,26,23,.14)]"
        }`}
        style={{
          bottom: Math.min(sheetH + 74 + 16, 702),
          transition: `bottom .26s ${EASE}`,
        }}
      >
        <span
          className="grid place-items-center transition-transform duration-200"
          style={{ transform: plusOpen ? "rotate(45deg)" : "none" }}
        >
          <PlusIcon stroke={plusOpen ? "#fbfaf6" : "#1c1a17"} />
        </span>
      </button>

      {/* 바텀시트 — 하단 바(74px) 위에 얹힙니다 */}
      <div
        className="absolute inset-x-0 bottom-[74px] z-[1100] flex flex-col rounded-t-[28px] bg-paper shadow-[0_-8px_30px_rgba(28,26,23,.16)]"
        style={{
          height: sheetH,
          transition: dragH === null ? `height .26s ${EASE}` : undefined,
        }}
      >
        <div
          onPointerDown={onHandleDown}
          className="shrink-0 cursor-grab touch-none pt-[11px] pb-[9px]"
        >
          <div className="mx-auto h-1 w-[42px] rounded-sm bg-[#cfc8ba]" />
        </div>

        <div className="flex shrink-0 items-center gap-3 px-5 pb-2.5">
          <div className="min-w-0 shrink-0"><div className="font-serif text-[18px] font-bold">{kind === "cafe" ? "카페 기록" : "맛집 기록"}</div><div className="mt-[3px] font-mono text-[10.5px] text-faint">가게 {filtered.length} · 기록 {inKind.length}</div></div>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[20px] border border-[#ded8cb] bg-card px-3"><SearchIcon size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="가게 · 지역 · 메뉴 · 메모" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-[#a8a196]" /></div>
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-[#e6e0d3] px-5 pb-2.5">
          <div className="flex items-center gap-4">{SORTS.map((s) => <button key={s.value} type="button" onClick={() => setSort(s.value)} className={`cursor-pointer border-none bg-transparent pb-[3px] text-[12.5px] ${sort === s.value ? "border-b border-ink font-medium text-ink" : "border-b border-transparent text-[#a8a196]"}`}>{s.label}</button>)}</div>
          <button type="button" onClick={() => setFiltersOpen(true)} className={`min-h-[38px] cursor-pointer rounded-[19px] px-[15px] text-[12.5px] ${activeFilters ? "border-none bg-ink text-card" : "border border-[#ded8cb] bg-card text-muted"}`}>{activeFilters ? `필터 ${activeFilters}` : "필터"}</button>
        </div>

        <div
          className="no-bar min-h-0 flex-1 overflow-y-auto px-4 pt-3"
          style={{ paddingBottom: "calc(108px + env(safe-area-inset-bottom))" }}
        >
          {filtered.length === 0 ? (
            <div className="px-5 py-11 text-center text-[12.5px] leading-[1.8] text-faint">
              조건에 맞는 기록이 없습니다.
              <br />
              필터를 지우거나 다른 낱말로 찾아보세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((p) => (
                <PlaceCard key={p.key} place={p} onOpen={() => openPlace(p.key)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "calendar" && (
        <CalendarScreen
          rows={visibleRows}
          wishes={wishes}
          onOpenDay={(dateKey) => setDay(dateKey)}
          onOpenWishDay={() => setTab("wish")}
        />
      )}

      {tab === "wish" && (
        <WishScreen
          wishes={wishes}
          onOpenForm={setWishFormTarget}
          onVerify={startVerify}
          onChanged={refresh}
        />
      )}

      {day && (
        <DayScreen
          dateKey={day}
          rows={visibleRows}
          onBack={() => setDay(null)}
          onOpenRecord={(record) => {
            setKind(record.kind);
            setPlaceKey(null);
            setVisitId(record.id);
          }}
        />
      )}

      {/* 아직 만들지 않은 탭 — 지도·월력·가고싶다 탭은 각자 화면이 있습니다 */}
      {tab !== "map" && tab !== "calendar" && tab !== "wish" && (
        <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1160] flex flex-col items-center justify-center gap-2.5 bg-paper">
          <div className="font-serif text-[19px] font-bold">{TAB_TITLE[tab]}</div>
          <div className="text-[12.5px] text-faint">이 화면은 아직 만들지 않았습니다</div>
        </div>
      )}

      {foundHit && (
        <div className="absolute inset-x-0 top-0 bottom-[74px] z-[1150] flex flex-col justify-end">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setFoundHit(null)}
            className="flex-1 cursor-pointer border-none bg-transparent"
          />
          <div className="rounded-t-[24px] bg-paper px-5 pt-4 pb-6 shadow-[0_-8px_30px_rgba(28,26,23,.18)]">
            <Eyebrow wide>찾았습니다</Eyebrow>
            <div className="mt-1.5 font-serif text-[22px] font-bold">{foundHit.restaurant.name}</div>
            <div className="mt-1 text-[11.5px] text-faint">
              {[foundHit.restaurant.category, foundHit.restaurant.region].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] text-[#a29a8c]">
              기록 {foundHit.place.visits.length}건 · 마지막 {dottedDate(foundHit.place.latest.visited_at)}
            </div>
            <div className="mt-3.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  openRevisit(foundHit.restaurant);
                  setFoundHit(null);
                }}
                className="min-h-[48px] flex-1 cursor-pointer rounded-[16px] border-none bg-ink text-[13px] font-medium text-card"
              >
                여기 또 왔어요 · 기록 추가
              </button>
              <button
                type="button"
                onClick={() => {
                  openWishPlan({
                    name: foundHit.restaurant.name,
                    where_text: foundHit.restaurant.address ?? foundHit.restaurant.region ?? undefined,
                    category: foundHit.restaurant.category ?? undefined,
                    lat: foundHit.restaurant.lat ?? undefined,
                    lng: foundHit.restaurant.lng ?? undefined,
                  });
                  setFoundHit(null);
                }}
                aria-label="가고싶다에 담기"
                className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-[16px] border border-[#e4dfd3] bg-transparent text-muted"
              >
                <BookmarkIcon size={16} stroke="#6b665e" />
              </button>
              <button
                type="button"
                onClick={() => {
                  openPlace(foundHit.place.key, foundHit.restaurant.kind);
                  setFoundHit(null);
                }}
                className="min-h-[48px] cursor-pointer rounded-[16px] border border-[#e4dfd3] bg-transparent px-4 text-[12.5px] whitespace-nowrap text-muted"
              >
                지난 기록 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {pickedPlace && (
        <SearchMissSheet
          name={pickedPlace.name}
          onAddRecord={() => {
            setEditing({
              mode: "new",
              kind,
              preset: {
                name: pickedPlace.name,
                address: pickedPlace.address,
                lat: pickedPlace.lat,
                lng: pickedPlace.lng,
              },
            });
            setPickedPlace(null);
          }}
          onAddWish={() => {
            openWishPlan({
              name: pickedPlace.name,
              where_text: pickedPlace.address ?? undefined,
              lat: pickedPlace.lat,
              lng: pickedPlace.lng,
            });
            setPickedPlace(null);
          }}
          onClose={() => setPickedPlace(null)}
        />
      )}

      {openWish && (
        <WishSheet
          wish={openWish}
          onClose={() => setOpenWishId(null)}
          onCaptureHere={() => startVerify(openWish)}
          onViewList={() => {
            setOpenWishId(null);
            setTab("wish");
          }}
          onChanged={refresh}
        />
      )}

      {wishFormTarget && (
        <WishForm
          target={wishFormTarget}
          wishes={wishes}
          onCancel={() => setWishFormTarget(null)}
          onSaved={() => {
            setWishFormTarget(null);
            refresh();
          }}
          onDuplicate={(dup) => {
            setWishFormTarget(null);
            setOpenWishId(dup.id);
          }}
        />
      )}

      <TabBar
        tab={tab}
        onChange={(t) => {
          setDay(null);
          setPlusOpen(false);
          setTab(t);
        }}
        onShoot={() => setFlow(true)}
      />

      {filtersOpen && (
        <FilterSheet
          kind={kind}
          onKindChange={(k) => { setKind(k); setCategories([]); setKeywords([]); closeAll(); }}
          categories={uniq(inKind.map((r) => r.category))}
          keywords={uniq(inKind.flatMap((r) => r.keywords))}
          selectedCategories={categories}
          selectedKeywords={keywords}
          revisitOnly={revisitOnly}
          verifiedOnly={verifiedOnly}
          count={filtered.length}
          onToggleCategory={(c) =>
            setCategories((p) => (p.includes(c) ? p.filter((v) => v !== c) : [...p, c]))
          }
          onToggleKeyword={(k) =>
            setKeywords((p) => (p.includes(k) ? p.filter((v) => v !== k) : [...p, k]))
          }
          onToggleRevisit={() => setRevisitOnly((v) => !v)}
          onToggleVerified={() => setVerifiedOnly((v) => !v)}
          onReset={() => {
            setCategories([]);
            setKeywords([]);
            setRevisitOnly(false);
            setVerifiedOnly(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {place && !visit && !editing && (
        <PlaceScreen
          place={place}
          onBack={closeAll}
          onOpenVisit={(id) => setVisitId(id)}
          onRevisit={() => openRevisit(place.latest)}
          onAddWish={() =>
            openWishPlan({
              name: place.name,
              where_text: place.address ?? place.region ?? undefined,
              category: place.category ?? undefined,
              lat: place.lat ?? undefined,
              lng: place.lng ?? undefined,
            })
          }
        />
      )}

      {visit && !editing && (
        <RecordScreen
          key={visit.id}
          record={visit}
          onRevisit={() => openRevisit(visit)}
          onAddWish={() =>
            openWishPlan({
              name: visit.name,
              where_text: visit.address ?? visit.region ?? undefined,
              category: visit.category ?? undefined,
              lat: visit.lat ?? undefined,
              lng: visit.lng ?? undefined,
            })
          }
          onBack={() => {
            // 그날 화면(day)에서 들어왔으면 월력까지 가지 않고 그날 화면으로 돌아갑니다.
            if (day) {
              setVisitId(null);
              return;
            }
            if (visitPlace && visitPlace.visits.length > 1) {
              setPlaceKey(visitPlace.key);
              setVisitId(null);
            } else {
              closeAll();
            }
          }}
          onEdit={() => setEditing({ mode: "edit", record: visit })}
          onChanged={refresh}
          onDeleted={() => {
            if (day) {
              setVisitId(null);
              refresh();
              return;
            }
            const many = (visitPlace?.visits.length ?? 1) > 1;
            setVisitId(null);
            setPlaceKey(many ? visitPlace!.key : null);
            refresh();
          }}
        />
      )}

      {editing && (
        <EditScreen
          target={editing}
          rows={rows}
          wishes={wishes}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setKind(saved.kind);
            setPlaceKey(null);
            setVisitId(saved.id);
            refresh();
          }}
        />
      )}

      {flow && (
        <CaptureFlow
          rows={rows}
          wishes={wishes}
          kind={kind}
          verifyWishId={verifyWishId}
          onCancel={() => {
            setFlow(false);
            setVerifyWishId(null);
          }}
          onDone={afterVerified}
        />
      )}

      {labelsOpen && <LabelBook rows={rows} onClose={() => setLabelsOpen(false)} />}

      {draftsOpen && (
        <DraftsScreen
          drafts={pendingRows}
          onClose={() => setDraftsOpen(false)}
          onWrite={(record) => {
            setDraftsOpen(false);
            setKind(record.kind);
            setPlaceKey(null);
            setVisitId(null);
            setEditing({ mode: "edit", record });
          }}
          onDeleted={refresh}
        />
      )}
    </div>
  );
}

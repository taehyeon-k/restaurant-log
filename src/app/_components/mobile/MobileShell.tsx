"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { groupPlaces, type Place } from "@/lib/places";
import type { Kind, Restaurant, Sort } from "@/lib/types";
import MobileMap, { type MapHandle } from "./MobileMap";
import PlaceCard from "./PlaceCard";
import FilterSheet from "./FilterSheet";
import PlaceScreen from "./PlaceScreen";
import RecordScreen from "./RecordScreen";
import EditScreen, { type EditTarget } from "./EditScreen";
import CaptureFlow, { type Verified } from "./CaptureFlow";
import LabelBook from "./LabelBook";
import { BURST, CameraIcon, PlusIcon, SearchIcon } from "./ui";

/** 시트가 멈추는 높이. 화면이 낮으면 그만큼 줄여 잡습니다. */
const SNAP_MAX = { peek: 192, half: 462, full: 742 };
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

export default function MobileShell({ rows }: { rows: Restaurant[] }) {
  const router = useRouter();

  const [kind, setKind] = useState<Kind>("restaurant");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [mapQuery, setMapQuery] = useState("");
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
  const [labelsOpen, setLabelsOpen] = useState(false);

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

  const placesByKind = useMemo(
    () => ({
      restaurant: groupPlaces(rows.filter((r) => r.kind === "restaurant")),
      cafe: groupPlaces(rows.filter((r) => r.kind === "cafe")),
    }),
    [rows]
  );

  const inKind = useMemo(() => rows.filter((r) => r.kind === kind), [rows, kind]);
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

  /* ── 지도 검색 ─────────────────────────────────── */

  function runMapSearch() {
    const needle = mapQuery.trim().toLowerCase();
    if (!needle) return;

    const hits = rows.filter((r) =>
      [r.name, r.region, r.address, r.category].some((f) =>
        (f ?? "").toLowerCase().includes(needle)
      )
    );
    if (!hits.length) return;

    const hitKind = hits[0].kind;
    const keys = uniq(
      hits.map(
        (r) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase()
      )
    );

    if (keys.length === 1) {
      setQ("");
      setCategories([]);
      setKeywords([]);
      const target = placesByKind[hitKind].find((p) => p.key === keys[0]);
      if (target?.lat != null && target.lng != null) {
        mapRef.current?.flyTo(target.lat, target.lng, 15);
      }
      openPlace(keys[0], hitKind);
      return;
    }

    setKind(hitKind);
    setQ(mapQuery);
    closeAll();

    const points = hits
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => [r.lat as number, r.lng as number] as [number, number]);
    mapRef.current?.fitTo(points);
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

  const overlayOpen = editing !== null || flow || labelsOpen;

  return (
    <div className="relative h-dvh overflow-hidden bg-map">
      <MobileMap
        ref={mapRef}
        places={filtered}
        selectedKey={placeKey}
        onSelect={(key) => openPlace(key)}
        frozen={overlayOpen}
      />

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
        className="absolute inset-x-4 z-[1000] flex items-center gap-[9px]"
        style={{ top: SAFE_TOP }}
      >
        <div className="flex h-[46px] min-w-0 flex-1 items-center gap-[9px] rounded-[23px] border border-line bg-card px-[15px] shadow-[0_4px_14px_rgba(28,26,23,.08)]">
          <SearchIcon />
          <input
            value={mapQuery}
            onChange={(e) => setMapQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runMapSearch();
            }}
            placeholder="음식점이나 지역 찾기"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-[#a8a196]"
          />
          <button
            type="button"
            onClick={runMapSearch}
            className="shrink-0 cursor-pointer border-none bg-transparent py-1.5 text-[12px] text-brick"
          >
            찾기
          </button>
        </div>

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

      {/* 카메라 방문인증 */}
      <button
        type="button"
        onClick={() => setFlow(true)}
        aria-label="사진으로 방문 인증"
        className="absolute right-4 z-[1000] grid size-15 cursor-pointer place-items-center rounded-full border-none bg-brick shadow-[0_8px_20px_rgba(180,85,45,.34)]"
        style={{ bottom: sheetH + 16, transition: `bottom .26s ${EASE}` }}
      >
        <CameraIcon />
      </button>

      {/* 인증 없이 직접 쓰기 */}
      <button
        type="button"
        onClick={() => setEditing({ mode: "new", kind })}
        aria-label="기록 직접 쓰기"
        className="absolute right-[88px] z-[1000] grid size-13 cursor-pointer place-items-center rounded-full border border-line bg-card shadow-[0_6px_16px_rgba(28,26,23,.14)]"
        style={{ bottom: sheetH + 20, transition: `bottom .26s ${EASE}` }}
      >
        <PlusIcon />
      </button>

      {/* 바텀시트 */}
      <div
        className="absolute inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-[28px] bg-paper shadow-[0_-8px_30px_rgba(28,26,23,.16)]"
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
        />
      )}

      {visit && !editing && (
        <RecordScreen
          key={visit.id}
          record={visit}
          onBack={() => {
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
          kind={kind}
          onCancel={() => setFlow(false)}
          onDone={afterVerified}
        />
      )}

      {labelsOpen && <LabelBook rows={rows} onClose={() => setLabelsOpen(false)} />}
    </div>
  );
}

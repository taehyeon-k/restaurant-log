"use client";

import { useEffect, useRef, useState } from "react";
import { loadNaverMaps } from "@/lib/loadNaverMaps";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { BookmarkIcon, SearchIcon } from "./ui";

/**
 * 전체 화면 지도로 위시의 자리를 고릅니다(HANDOFF-wish.md §4, SpotPicker).
 * LocationPickerMap 과 달리 지도를 움직여 가운데 십자(책갈피)에 맞추는
 * 방식이라 마커를 두지 않고, 지도 중심 좌표를 그대로 읽습니다.
 */
export default function SpotPicker({
  initial,
  onCancel,
  onPick,
}: {
  initial: { lat: number; lng: number } | null;
  onCancel: () => void;
  /** 검색으로 골랐으면 그 이름·주소도 함께 넘깁니다. */
  onPick: (lat: number, lng: number, found?: { name: string; address: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const centerRef = useRef({ lat: initial?.lat ?? 37.5665, lng: initial?.lng ?? 126.978 });
  /** 검색으로 옮겨간 자리 정보 — 사람이 손으로 지도를 다시 끌면 지웁니다. */
  const foundRef = useRef<{ name: string; address: string } | null>(null);

  /** 지도 위 검색줄 — 메인 지도 화면과 같은 방식으로, 손으로 끌지 않고 이름으로 바로 찾아갑니다. */
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await forwardGeocode(q, ctrl.signal));
      } catch {
        /* aborted or offline */
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  function chooseResult(p: Place) {
    skipSearch.current = true;
    setQ(p.name || p.address);
    setOpen(false);
    setResults([]);
    centerRef.current = { lat: p.lat, lng: p.lng };
    foundRef.current = { name: p.name, address: p.address };
    mapRef.current?.morph(new naver.maps.LatLng(p.lat, p.lng), 17, { duration: 500 });
  }

  useEffect(() => {
    let cancelled = false;
    loadNaverMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const maps = naver.maps;
      const map = new maps.Map(containerRef.current, {
        center: new maps.LatLng(centerRef.current.lat, centerRef.current.lng),
        zoom: initial ? 16 : 13,
        keyboardShortcuts: false,
        zoomControl: true,
        zoomControlOptions: { position: maps.Position.BOTTOM_RIGHT },
      });
      maps.Event.addListener(map, "idle", () => {
        const c = map.getCenter() as naver.maps.LatLng;
        centerRef.current = { lat: c.lat(), lng: c.lng() };
      });
      maps.Event.addListener(map, "dragstart", () => {
        foundRef.current = null;
      });
      mapRef.current = map;
    }).catch((error: unknown) => console.error(error));

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-[1600] flex flex-col bg-paper">
      <div
        className="relative z-10 flex shrink-0 items-center justify-between px-3.5 pb-3"
        style={{ paddingTop: "max(48px, calc(env(safe-area-inset-top) + 8px))" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] text-faint"
        >
          취소
        </button>
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-faint">PICK A SPOT</span>
        <button
          type="button"
          onClick={() => onPick(centerRef.current.lat, centerRef.current.lng, foundRef.current ?? undefined)}
          className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[13px] font-medium text-brick"
        >
          이 자리
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="naver-map-tone absolute inset-0 h-full w-full" />

        <div className="absolute inset-x-4 top-3.5 z-10">
          <div className="flex h-[46px] items-center gap-[9px] rounded-[23px] border border-line bg-card px-[15px] shadow-[0_4px_14px_rgba(28,26,23,.14)]">
            <SearchIcon />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="가게 이름이나 주소로 찾기"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-[#a8a196]"
            />
            {busy && <span className="shrink-0 font-mono text-[10px] text-faint">검색 중…</span>}
            {q && !busy && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ("");
                  setResults([]);
                }}
                className="shrink-0 cursor-pointer font-mono text-[11px] text-faint hover:text-brick"
              >
                지우기
              </button>
            )}
          </div>

          {open && results.length > 0 && (
            <ul className="absolute inset-x-0 top-[52px] overflow-hidden rounded-[16px] border border-line bg-card shadow-[0_12px_28px_rgba(28,26,23,.12)]">
              {results.map((p, i) => (
                <li key={`${p.lat}-${p.lng}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseResult(p)}
                    className="flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-brick-soft"
                  >
                    <span className="text-[13.5px] font-medium text-ink">{p.name || p.address}</span>
                    <span className="text-[11.5px] text-muted">{p.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full"
          style={{ filter: "drop-shadow(0 2px 5px rgba(28,26,23,.35))" }}
        >
          <div className="rounded-full border-[1.4px] border-card bg-brick p-[7px]">
            <BookmarkIcon size={20} fill="#fbfaf6" stroke="#fbfaf6" strokeWidth={0} />
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-6 rounded-[16px] border border-line bg-card px-4 py-3 text-center text-[12px] leading-[1.6] text-muted shadow-[0_8px_20px_rgba(28,26,23,.1)]">
          위에서 찾아 바로 옮겨가거나, 지도를 움직여 가운데 표시를 가게 자리에 맞춰주세요.
        </div>
      </div>
    </div>
  );
}

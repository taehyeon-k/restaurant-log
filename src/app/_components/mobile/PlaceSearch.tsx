"use client";

import { useEffect, useRef, useState } from "react";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { SearchIcon } from "./ui";

export type PickedPlace = { name: string; address: string; lat: number; lng: number } | null;

/**
 * 지도 위 메인 검색창 — PC 버전의 PlaceSearch 와 같은 방식입니다.
 * 내 기록만 거르는 시트 안 검색(SearchBar 대응)과 달리, 어디든 실시간으로
 * 찾아 지도를 옮기고, 아직 기록에 없는 곳이면 그 자리에 새 기록을 붙일 수 있게 합니다.
 */
export default function MobilePlaceSearch({
  value,
  onChange,
  onChoose,
  picked,
  onClearPicked,
}: {
  value: string;
  onChange: (v: string) => void;
  onChoose: (p: Place) => void;
  picked: PickedPlace;
  onClearPicked: () => void;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (!open || value.trim().length < 2) {
      setResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await forwardGeocode(value, ctrl.signal));
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
  }, [value, open]);

  function choose(p: Place) {
    skip.current = true;
    onChange(p.name || p.address);
    setOpen(false);
    setResults([]);
    onChoose(p);
  }

  function clear() {
    onChange("");
    setResults([]);
    onClearPicked();
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex h-[46px] items-center gap-[9px] rounded-[23px] border border-line bg-card px-[15px] shadow-[0_4px_14px_rgba(28,26,23,.08)]">
        <SearchIcon />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="음식점이나 지역 찾기"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-[#a8a196]"
        />

        {busy && <span className="shrink-0 font-mono text-[10px] text-faint">검색 중…</span>}

        {(value || picked) && !busy && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="shrink-0 cursor-pointer font-mono text-[11px] text-faint hover:text-brick"
          >
            지우기
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-[52px] z-10 overflow-hidden rounded-[16px] border border-line bg-card shadow-[0_12px_28px_rgba(28,26,23,.12)]">
          {results.map((p, i) => (
            <li key={`${p.lat}-${p.lng}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
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
  );
}

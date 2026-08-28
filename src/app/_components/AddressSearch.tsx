"use client";

import { useEffect, useRef, useState } from "react";
import { forwardGeocode, type Place } from "@/lib/geocode";

export default function AddressSearch({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
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
    }, 250); // Nominatim 초당 1회 제한

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, open]);

  function choose(p: Place) {
    skip.current = true;
    onChange(p.address);
    onPick(p);
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative flex-1">
      <div className="flex h-12 items-center gap-3 rounded-[26px] border border-line bg-card px-4.5 shadow-[0_6px_18px_rgba(28,26,23,0.07)]">
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
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="주소를 검색하거나 지도에서 위치를 클릭하세요"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#b3ada1]"
        />

        {busy && <span className="font-mono text-[11px] text-faint">검색 중…</span>}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-14 overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_12px_28px_rgba(28,26,23,0.12)]">
          {results.map((p, i) => (
            <li key={`${p.lat}-${p.lng}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-line px-4.5 py-3 text-left last:border-0 hover:bg-brick-soft"
              >
                <span className="text-sm font-medium">{p.name || p.address}</span>
                <span className="text-[12.5px] text-muted">{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

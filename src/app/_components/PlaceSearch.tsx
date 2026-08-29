"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardGeocode, type Place } from "@/lib/geocode";
import type { Restaurant } from "@/lib/types";
import { usePlace } from "./Workspace";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 두 좌표 사이 거리(m). 같은 가게인지 판단하는 데만 씁니다. */
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

export default function PlaceSearch({ rows }: { rows: Restaurant[] }) {
  const router = useRouter();
  const { place, setPlace } = usePlace();

  const [value, setValue] = useState("");
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

  /** 이미 기록한 가게인지 — 이름이 같거나, 150m 안에 있으면 같은 곳으로 봅니다. */
  function findRecord(p: Place) {
    const needle = norm(p.name || "");

    if (needle) {
      const byName = rows.find((r) => {
        const n = norm(r.name);
        return n === needle || n.includes(needle) || needle.includes(n);
      });
      if (byName) return byName;
    }

    return rows.find(
      (r) =>
        r.lat !== null &&
        r.lng !== null &&
        metersBetween(r.lat, r.lng, p.lat, p.lng) < 150
    );
  }

  function choose(p: Place) {
    skip.current = true;
    setValue(p.name || p.address);
    setOpen(false);
    setResults([]);

    const hit = findRecord(p);
    if (hit) {
      setPlace(null);
      router.push(`/?id=${hit.id}`, { scroll: false });
      return;
    }

    setPlace({
      name: p.name || p.address,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    });
  }

  function clear() {
    setValue("");
    setResults([]);
    setPlace(null);
  }

  const addHref = place
    ? `/add?${new URLSearchParams({
        name: place.name,
        address: place.address,
        lat: String(place.lat),
        lng: String(place.lng),
      })}`
    : "/add";

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
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="지도에서 음식점이나 지역 찾기"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#b3ada1]"
        />

        {busy && <span className="font-mono text-[11px] text-faint">검색 중…</span>}

        {(value || place) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="cursor-pointer font-mono text-[11px] tracking-[0.08em] text-faint hover:text-brick"
          >
            지우기
          </button>
        )}
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

      {place && !open && (
        <div className="absolute inset-x-0 top-14 flex items-center justify-between gap-4 rounded-[14px] border border-line bg-card px-4.5 py-3 shadow-[0_12px_28px_rgba(28,26,23,0.12)]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{place.name}</span>
            <span className="truncate text-[12.5px] text-muted">
              {place.address}
            </span>
          </div>
          <Link
            href={addHref}
            className="shrink-0 rounded-[20px] bg-ink px-4 py-2.5 text-[13px] font-medium text-paper transition-colors hover:bg-brick"
          >
            + 여기에 기록 추가
          </Link>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { groupPlaces } from "@/lib/places";
import { nearbyPlaces } from "@/lib/geocode";
import { dataUrlToBlob, uploadPhoto } from "@/lib/photos";
import { matchWish, wishMetInfo, type Kind, type Restaurant, type Wish } from "@/lib/types";
import { CameraIcon, PinIcon, VerifiedMark, photoFill } from "./ui";

export type Verified = { record: Restaurant; writeNow: boolean };

type Candidate = {
  id: string;
  name: string;
  kind: Kind;
  category: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  /** 이미 내 기록에 있는 가게 */
  mine: boolean;
};

type Geo = { lat: number; lng: number; acc: number };

/** 촬영 프레임 — 디자인은 352px 이고, 화면이 낮으면 셔터에 닿지 않게 줄입니다. */
const FRAME: React.CSSProperties = {
  top: 152,
  height: "min(352px, calc(100dvh - 352px))",
};

/**
 * 줌 — 기기가 `MediaStreamTrack` 의 zoom capability 를 지원하면 그 범위를,
 * 아니면 CSS scale 로 흉내 낼 이 기본 범위를 씁니다.
 */
const CSS_ZOOM_RANGE = { min: 1, max: 3, step: 0.1 };

type ZoomRange = { min: number; max: number; step: number };
/** 표준 타입에 없는 실험적 zoom capability — 지원 브라우저(주로 Chrome)에만 있습니다. */
type ZoomCapabilities = MediaTrackCapabilities & { zoom?: ZoomRange };
type ZoomSettings = MediaTrackSettings & { zoom?: number };
type ZoomConstraints = MediaTrackConstraints & {
  advanced?: (MediaTrackConstraintSet & { zoom?: number })[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 두 좌표 사이 거리(m) */
function metersBetween(a: Geo, lat: number, lng: number) {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLng = rad(lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** 시제품의 문구 그대로 — 왜 안 되는지와 대신 무엇을 할 수 있는지. */
function camMessage(name?: string) {
  if (name === "NotAllowedError")
    return "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용한 뒤 다시 시도하거나, 아래 버튼으로 찍어 주세요.";
  if (name === "TimeoutError")
    return "이 화면에서는 카메라가 열리지 않습니다. 폰 브라우저에서 열면 바로 켜지고, 지금은 아래 버튼으로 찍을 수 있습니다.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "쓸 수 있는 카메라가 없습니다. 아래 버튼으로 찍어 주세요.";
  return "카메라를 열 수 없습니다. 아래 버튼으로 찍어 주세요.";
}

export default function CaptureFlow({
  rows,
  wishes,
  kind,
  onCancel,
  onDone,
}: {
  rows: Restaurant[];
  wishes: Wish[];
  kind: Kind;
  onCancel: () => void;
  onDone: (result: Verified) => void;
}) {
  const [step, setStep] = useState<"shoot" | "pick" | "done">("shoot");
  const [shot, setShot] = useState<string | null>(null);
  const [shotAt, setShotAt] = useState<Date | null>(null);

  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  // 카메라 상태는 "몇 번째 시도인지"로 묶어 둡니다 — 다시 시도·전환이
  // session 을 올리면 지난 시도의 결과는 그대로 흘려보냅니다.
  const [session, setSession] = useState(0);
  const [cam, setCam] = useState<{
    session: number;
    live: boolean;
    err: string | null;
  }>({ session: 0, live: false, err: null });
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  // 지금 켠 트랙이 네이티브 줌을 지원하면 그 범위, 아니면 null(= CSS 흉내).
  const [zoomCaps, setZoomCaps] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRange = zoomCaps ?? CSS_ZOOM_RANGE;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const [extra, setExtra] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 이 브라우저가 카메라를 다룰 수 있는지 — 렌더 중에 그대로 읽습니다. */
  const supported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const camLive = cam.session === session && cam.live;
  const camErr = !supported
    ? "이 브라우저는 카메라를 지원하지 않습니다. 아래 버튼으로 찍어 주세요."
    : cam.session === session
      ? cam.err
      : null;

  /* ── 카메라 ─────────────────────────────────────── */

  const stopCam = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    liveRef.current = false;
  }, []);

  useEffect(() => {
    if (step !== "shoot" || !supported) return;

    let done = false;
    liveRef.current = false;

    timerRef.current = setTimeout(() => {
      if (done || liveRef.current) return;
      setCam({ session, live: false, err: camMessage("TimeoutError") });
    }, 4000);

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
        audio: false,
      })
      .then((stream) => {
        if (done) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        liveRef.current = true;
        setCam({ session, live: true, err: null });

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        let caps: ZoomCapabilities | undefined;
        try {
          caps = track.getCapabilities?.() as ZoomCapabilities | undefined;
        } catch {
          caps = undefined;
        }
        if (caps?.zoom) {
          setZoomCaps(caps.zoom);
          const settings = track.getSettings() as ZoomSettings;
          setZoom(settings.zoom ?? caps.zoom.min);
        } else {
          setZoomCaps(null);
          setZoom(1);
        }
      })
      .catch((err: DOMException) => {
        if (done) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        setCam({ session, live: false, err: camMessage(err?.name) });
      });

    return () => {
      done = true;
      stopCam();
    };
  }, [step, facing, session, supported, stopCam]);

  /**
   * 화면 한 장을 최대 900px 로 줄여 JPEG 으로 굽습니다.
   * 네이티브 줌이면 트랙 자체가 이미 확대된 프레임을 주므로 그대로 굽고,
   * CSS 로 흉내 낸 줌이면(트랙은 원본 그대로) 화면에 보이는 만큼만 가운데를 잘라 굽습니다.
   */
  function grabFrame() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;

    const cssZoom = !zoomCaps && zoom > 1;
    const cropW = cssZoom ? v.videoWidth / zoom : v.videoWidth;
    const cropH = cssZoom ? v.videoHeight / zoom : v.videoHeight;
    const sx = (v.videoWidth - cropW) / 2;
    const sy = (v.videoHeight - cropH) / 2;

    const scale = Math.min(1, 900 / Math.max(cropW, cropH));
    const w = Math.round(cropW * scale);
    const h = Math.round(cropH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, w, h);

    return canvas.toDataURL("image/jpeg", 0.72);
  }

  /* ── 줌 ────────────────────────────────────────── */

  /** 슬라이더·+/-·핀치가 모두 이 함수로 모입니다. */
  function setZoomClamped(next: number) {
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, next));
    setZoom(clamped);

    if (zoomCaps) {
      trackRef.current
        ?.applyConstraints({ advanced: [{ zoom: clamped }] } as ZoomConstraints)
        .catch(() => {});
    }
  }

  function touchDist(touches: React.TouchList) {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onPinchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: touchDist(e.touches), zoom };
    }
  }

  function onPinchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = touchDist(e.touches) / pinchRef.current.dist;
      setZoomClamped(pinchRef.current.zoom * ratio);
    }
  }

  function onPinchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
  }

  /* ── 위치 · 후보 ────────────────────────────────── */

  /** 촬영 순간 한 번만 읽습니다. 좌표는 후보를 찾는 데에만 쓰고 저장하지 않습니다. */
  const readGeo = useCallback(() => {
    setGeo(null);
    setGeoErr(null);

    if (!navigator.geolocation) {
      setGeoErr("위치를 지원하지 않는 브라우저입니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (p) =>
        setGeo({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: Math.round(p.coords.accuracy),
        }),
      () => setGeoErr("위치 권한이 없어 좌표를 읽지 못했습니다."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, []);

  /** 1순위는 내 기록의 가게 — 읽은 좌표에서 800m 안쪽을 거리순으로. */
  const mine = useMemo<Candidate[]>(() => {
    if (!geo) return [];

    return groupPlaces(rows)
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        id: `mine:${p.key}`,
        name: p.name,
        kind: p.kind,
        category: p.category,
        region: p.region,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        distance: metersBetween(geo, p.lat as number, p.lng as number),
        mine: true,
      }))
      .filter((c) => (c.distance ?? 0) <= 800)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 4);
  }, [geo, rows]);

  const candidates = useMemo(() => {
    const taken = new Set(mine.map((c) => c.name));
    return [...mine, ...extra.filter((c) => !taken.has(c.name))]
      .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
      .slice(0, 8);
  }, [mine, extra]);

  // 그다음 둘레 장소 검색 — 좌표는 이 요청에만 쓰고 저장하지 않습니다.
  useEffect(() => {
    if (step !== "pick" || !geo) return;

    let cancelled = false;

    nearbyPlaces(geo.lat, geo.lng, kind)
      .then((found) => {
        if (cancelled) return;
        setExtra(
          found.map((f) => ({
            id: `near:${f.name}:${f.lat},${f.lng}`,
            name: f.name,
            kind,
            category: f.category,
            region: f.region,
            address: f.address,
            lat: f.lat,
            lng: f.lng,
            distance: f.distance,
            mine: false,
          }))
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [step, geo, kind]);

  /* ── 저장 ─────────────────────────────────────── */

  async function commit(writeNow: boolean) {
    if (!picked || !shot) return;
    setSaving(true);
    setError("");

    try {
      const url = await uploadPhoto(dataUrlToBlob(shot), "verified.jpg");
      const at = shotAt ?? new Date();

      const twin = rows.find(
        (r) => r.name === picked.name && r.kind === picked.kind
      );

      const address = twin?.address ?? picked.address ?? null;

      // 이름이 같은 위시가 있으면 이 인증 기록은 그 위시가 이루어진 것입니다(§7, WISH MET).
      const matchedWish = matchWish(wishes, picked.name);
      const fromWish = matchedWish ? wishMetInfo(matchedWish, isoDate(at)) : null;

      const { data, error } = await supabase
        .from("restaurants")
        .insert({
          kind: picked.kind,
          name: picked.name,
          category: twin?.category ?? picked.category,
          region: twin?.region ?? picked.region,
          address,
          place_key: `${picked.name}|${address ?? ""}`.toLowerCase(),
          // 좌표는 고른 가게의 것입니다 — 읽은 위치는 저장하지 않습니다.
          lat: twin?.lat ?? picked.lat,
          lng: twin?.lng ?? picked.lng,
          rating: null,
          menu: null,
          menus: [],
          price_level: null,
          price_range: null,
          review: null,
          keywords: [],
          revisit: Boolean(twin),
          visited_at: isoDate(at),
          photo_url: url,
          photo_urls: [url],
          cover_index: 0,
          verified: true,
          acc: geo?.acc ?? null,
          pending: !writeNow,
          from_wish: fromWish,
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      if (matchedWish) await supabase.from("wishes").delete().eq("id", matchedWish.id);

      onDone({ record: data as Restaurant, writeNow });
    } catch (err) {
      setError(err instanceof Error ? err.message : "기록을 저장하지 못했습니다");
      setSaving(false);
    }
  }

  /* ── 6-1 촬영 ──────────────────────────────────── */

  if (step === "shoot") {
    const status = camErr
      ? "카메라를 열 수 없습니다"
      : camLive
        ? "찍고 나서 가게를 고르면 돼요"
        : "카메라를 여는 중입니다…";

    const takeShot = () => {
      const frame = grabFrame();
      if (!frame) {
        setCam({
          session,
          live: false,
          err: "카메라 화면이 아직 준비되지 않았습니다. 아래 버튼으로 찍어 주세요.",
        });
        return;
      }
      readGeo();
      setShot(frame);
      setShotAt(new Date());
      setStep("pick");
    };

    const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        readGeo();
        setShot(String(reader.result));
        setShotAt(new Date());
        setStep("pick");
      };
      reader.readAsDataURL(file);
    };

    return (
      <div className="absolute inset-0 z-[1400] bg-[#171614]">
        <div
          style={FRAME}
          className="absolute inset-x-4 touch-none overflow-hidden rounded-[28px] bg-[#232120]"
          onTouchStart={onPinchStart}
          onTouchMove={onPinchMove}
          onTouchEnd={onPinchEnd}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            style={zoomCaps ? undefined : { transform: `scale(${zoom})`, transformOrigin: "center" }}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="absolute left-4 z-[3] grid size-11 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.14)] text-[16px] text-card"
          style={{ top: "max(52px, calc(env(safe-area-inset-top) + 10px))" }}
        >
          ✕
        </button>

        <div className="absolute inset-x-0 top-[70px] flex flex-col items-center gap-[7px]">
          <div className="font-serif text-[18px] font-bold text-card">지금 여기</div>
          <div className="rounded-[14px] bg-[rgba(251,250,246,.12)] px-3 py-1 text-[11px] text-[rgba(251,250,246,.8)]">
            {status}
          </div>
        </div>

        {camErr && (
          <div
            style={FRAME}
            className="absolute inset-x-4 flex flex-col items-center justify-center gap-4 rounded-[28px] bg-[#232120] px-8 text-center"
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(251,250,246,.45)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="5.5" width="19" height="14" rx="3.5" />
              <circle cx="12" cy="12.5" r="4" />
              <path d="M4 3l16 18" />
            </svg>

            <div className="text-[12.5px] leading-[1.7] text-[rgba(251,250,246,.6)]">
              {camErr}
            </div>

            <div className="flex gap-2">
              <label className="grid min-h-11 cursor-pointer place-items-center rounded-[18px] bg-brick px-[18px] text-[12.5px] text-card">
                사진 찍어 올리기
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={pickFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setSession((n) => n + 1)}
                className="min-h-11 cursor-pointer rounded-[18px] border border-[rgba(251,250,246,.3)] bg-transparent px-4 text-[12.5px] text-[rgba(251,250,246,.8)]"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {!camErr && (
          <div className="absolute inset-x-8 bottom-[212px] flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setZoomClamped(zoom - zoomRange.step)}
              aria-label="줌 축소"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.16)] text-[16px] text-card"
            >
              −
            </button>

            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
              aria-label="줌"
              className="h-1 flex-1 accent-[#fbfaf6]"
            />

            <button
              type="button"
              onClick={() => setZoomClamped(zoom + zoomRange.step)}
              aria-label="줌 확대"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.16)] text-[16px] text-card"
            >
              +
            </button>

            <span className="shrink-0 rounded-[10px] bg-[rgba(251,250,246,.16)] px-2 py-1 font-mono text-[11px] text-card">
              {zoom.toFixed(1)}x
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-32 flex items-center justify-center gap-[34px]">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label="카메라 전환"
            className="grid size-11 cursor-pointer place-items-center rounded-full border-none bg-[rgba(251,250,246,.1)] text-[15px] text-[rgba(251,250,246,.6)]"
          >
            ↺
          </button>

          <button
            type="button"
            onClick={takeShot}
            aria-label="찍기"
            className="grid size-[78px] cursor-pointer place-items-center rounded-full border-[3px] border-[rgba(251,250,246,.85)] bg-transparent p-0"
          >
            <span className="block size-[62px] rounded-full bg-card" />
          </button>

          <label className="grid size-11 cursor-pointer place-items-center rounded-full bg-[rgba(251,250,246,.1)]">
            <CameraIcon size={19} stroke="rgba(251,250,246,.6)" width={1.6} />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={pickFile}
              className="hidden"
            />
          </label>
        </div>

        <div className="absolute inset-x-0 bottom-[62px] text-center text-[11.5px] text-[rgba(251,250,246,.45)]">
          갤러리에서 고른 사진은 인증되지 않아요
        </div>
      </div>
    );
  }

  /* ── 6-2 가게 고르기 ───────────────────────────── */

  if (step === "pick") {
    return (
      <div className="absolute inset-0 z-[1400] bg-paper">
        <div
          className="absolute inset-x-5 flex items-center gap-3.5"
          style={{ top: "max(62px, calc(env(safe-area-inset-top) + 20px))" }}
        >
          <div
            className="size-[74px] shrink-0 rounded-[18px]"
            style={photoFill(shot, "한식")}
          />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[20px] leading-[1.35] font-bold">
              여기 어디예요?
            </div>
            <div className="mt-[5px] text-[11.5px] leading-[1.55] text-muted">
              {geo
                ? `지금 위치에서 가까운 곳입니다 (정확도 ${geo.acc}m)`
                : geoErr ?? "위치를 읽는 중입니다…"}
            </div>
          </div>
        </div>

        <div className="no-bar absolute inset-x-0 top-[158px] bottom-[104px] overflow-y-auto px-5">
          <div className="flex flex-col gap-[9px]">
            {candidates.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicked(c);
                  setStep("done");
                }}
                className={`flex min-h-[62px] w-full cursor-pointer items-center gap-3 rounded-[20px] bg-card px-[15px] py-[13px] ${
                  i === 0
                    ? "border-[1.5px] border-brick shadow-[0_4px_14px_rgba(180,85,45,.1)]"
                    : "border border-[#ded8cb]"
                }`}
              >
                <span
                  className={`grid size-[34px] shrink-0 place-items-center rounded-full font-mono text-[9.5px] ${
                    i === 0 ? "bg-brick-soft text-brick" : "bg-[#f1ede4] text-muted"
                  }`}
                >
                  {c.distance == null ? "—" : `${c.distance}m`}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-serif text-[16px] font-bold text-ink">
                    {c.name}
                  </span>
                  <span className="mt-[3px] block truncate text-[11.5px] text-faint">
                    {[c.mine ? "내 기록" : c.category, c.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            ))}

            {candidates.length === 0 && (
              <div className="px-2 py-10 text-center text-[12.5px] leading-[1.8] text-faint">
                {geoErr
                  ? "위치를 읽지 못해 가까운 가게를 찾을 수 없습니다."
                  : "가까운 가게를 찾는 중입니다…"}
              </div>
            )}

            <button
              type="button"
              onClick={onCancel}
              className="mt-1 flex min-h-12 cursor-pointer items-center justify-center rounded-[20px] border border-dashed border-line bg-transparent text-[12.5px] text-muted"
            >
              여기 없어요 · 직접 찾기
            </button>
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-[26px] rounded-[18px] border border-[#e4dfd3] bg-card px-4 py-3.5">
          <div className="flex items-center gap-[9px]">
            <PinIcon />
            <div className="min-w-0 flex-1 text-[11.5px] leading-[1.55] text-muted">
              {geo
                ? `읽은 좌표 ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} — 가까운 가게를 찾는 데에만 쓰고, 기록에는 남기지 않습니다.`
                : "위치는 사진 찍는 순간 한 번만 읽고, 좌표는 기록에 남기지 않습니다."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── 6-3 인증 완료 ─────────────────────────────── */

  const at = shotAt ?? new Date();

  return (
    <div className="absolute inset-0 z-[1400] bg-paper">
      <div
        className="absolute inset-x-5 rounded-[30px] bg-card px-3.5 pt-3.5 pb-5 shadow-[0_12px_32px_rgba(28,26,23,.09)]"
        style={{ top: "max(74px, calc(env(safe-area-inset-top) + 30px))" }}
      >
        <div
          className="relative h-[296px] overflow-hidden rounded-[22px]"
          style={photoFill(shot, picked?.category ?? "한식")}
        >
          <div className="absolute top-3.5 left-3.5 rounded-[14px] bg-[rgba(28,26,23,.55)] px-[11px] py-1 font-mono text-[9.5px] tracking-[0.1em] text-card">
            {hhmm(at)}
          </div>
          <div className="absolute right-4 bottom-4">
            <VerifiedMark size={52} shadow />
          </div>
        </div>

        <div className="mt-[18px] text-center">
          <div className="font-serif text-[22px] font-bold">방문이 인증되었습니다</div>
          <div className="mt-[7px] text-[12px] leading-[1.6] text-muted">
            {picked?.name} · {isoDate(at).replaceAll("-", ".")} {hhmm(at)}
          </div>
          {error && <div className="mt-2 text-[12px] text-[#a8412a]">{error}</div>}
        </div>
      </div>

      <div className="absolute inset-x-5 bottom-[26px]">
        <button
          type="button"
          onClick={() => commit(true)}
          disabled={saving}
          className="w-full cursor-pointer rounded-[20px] border-none bg-ink p-[17px] text-[15px] font-medium text-card disabled:opacity-60"
        >
          {saving ? "저장 중…" : "이어서 기록 쓰기"}
        </button>
        <button
          type="button"
          onClick={() => commit(false)}
          disabled={saving}
          className="mt-2 w-full cursor-pointer rounded-[20px] border-none bg-transparent p-3.5 text-[13px] text-faint disabled:opacity-60"
        >
          나중에 쓸게요
        </button>
      </div>
    </div>
  );
}

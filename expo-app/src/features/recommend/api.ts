import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { getState, setState, useAppState, type RecHere } from "@/data/store";
import { apiFetch } from "@/lib/api";
import { reverseGeocode } from "@/lib/geocode";
import type { KakaoPlace } from "@/lib/rec/candidates";
import type { Weather } from "@/lib/rec/score";
import { areaOf, frequentSpot, type Course, type PlaceStat } from "@/lib/recommend";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

/**
 * 추천 탭 v2 의 서버 숫자(supabase/migrations/20261017000000_recommend_v2.sql).
 * 남의 기록은 사람 수 · 건수 · 비율 · 마지막 인증 시각으로만 옵니다 — 사용자 id · 사진은 오지 않습니다.
 */

/** 좌표를 100m 남짓으로 뭉쳐 조금 움직여도 다시 묻지 않게. */
const cell = (n: number) => Math.round(n * 1000) / 1000;
const FIVE_MIN = 5 * 60 * 1000;

/** at — 기준 시각(ms). null 이면 지금(서버 now()). 시간대 인증 수가 이 요일 · 시각으로 셉니다. */
const atParam = (at: number | null | undefined) => (at ? { p_at: new Date(at).toISOString() } : {});

export const useRecPlaces = (here: { lat: number; lng: number } | null, radius: number, at?: number | null) =>
  useQuery({
    queryKey: ["rec", "places", here && cell(here.lat), here && cell(here.lng), radius, at ?? null],
    enabled: !!here,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rec_places", { p_lat: here!.lat, p_lng: here!.lng, p_radius_m: radius, ...atParam(at) });
      if (error) throw new Error(error.message);
      return (data ?? []) as PlaceStat[];
    },
  });

/**
 * 「지금 뭐 먹지」 카카오 후보(서버 /api/recommend/candidates — 카카오 키는 서버에만).
 * 서버가 아직 배포 전(404)이거나 실패하면 에러 — 추천은 Dinary 기록 · 위시만으로 이어 갑니다.
 */
export const useRecCandidates = (here: { lat: number; lng: number } | null, radius: number, enabled = true) =>
  useQuery({
    queryKey: ["rec", "kakao", here && cell(here.lat), here && cell(here.lng), radius],
    enabled: !!here && enabled,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ lat: String(cell(here!.lat)), lng: String(cell(here!.lng)), radius: String(radius) });
      const res = await apiFetch(`/api/recommend/candidates?${params}`, { signal });
      if (!res.ok) throw new Error(`candidates ${res.status}`);
      const json = (await res.json()) as { candidates?: KakaoPlace[]; radius?: number; partial?: boolean };
      return { candidates: json.candidates ?? [], radius, partial: !!json.partial };
    },
  });

/** 기상청 초단기실황(서버 /api/weather). 못 받으면 null — 날씨 성분은 중립. 실패해도 에러를 내지 않습니다. */
export const useRecWeather = (here: { lat: number; lng: number } | null) =>
  useQuery({
    queryKey: ["rec", "weather", here && Math.round(here.lat * 50) / 50, here && Math.round(here.lng * 50) / 50],
    enabled: !!here,
    staleTime: 20 * 60 * 1000,
    retry: 0,
    queryFn: async ({ signal }): Promise<Weather | null> => {
      const params = new URLSearchParams({ lat: String(Math.round(here!.lat * 100) / 100), lng: String(Math.round(here!.lng * 100) / 100) });
      const res = await apiFetch(`/api/weather?${params}`, { signal }).catch(() => null);
      if (!res?.ok) return null;
      const json = (await res.json().catch(() => null)) as { weather?: Weather | null } | null;
      return json?.weather ?? null;
    },
  });

/** 「지금 시작하는 코스」 출발 반경. */
const COURSE_START_M = 2000;

export const useRecCourses = (here: { lat: number; lng: number } | null, at?: number | null) =>
  useQuery({
    queryKey: ["rec", "courses", here && cell(here.lat), here && cell(here.lng), at ?? null],
    enabled: !!here,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rec_courses", { p_lat: here!.lat, p_lng: here!.lng, p_radius_m: COURSE_START_M, ...atParam(at) });
      if (error) throw new Error(error.message);
      return (data ?? []) as Course[];
    },
  });

export type NextPlace = { place: string; name: string; category: string | null; lat: number; lng: number; users: number };

export const useNextAfter = (placeKey: string | null) =>
  useQuery({
    queryKey: ["rec", "next", placeKey],
    enabled: !!placeKey,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rec_next_after", { p_place: placeKey });
      if (error) throw new Error(error.message);
      return (data ?? []) as NextPlace[];
    },
  });

/* ───────────── 투어 ───────────── */

export type TourKind = "menu" | "season" | "trend";
export type Tour = {
  id: string; kind: TourKind; title: string; region: string | null; need: number; source_note: string | null;
  aired_at: string | null; ends_at: string | null; mark_name: string | null;
  total: number; done: number; finishers: number | null; in_progress: number | null; revisit_rate: number | null; completed_at: string | null;
};
export type TourPlace = {
  place: string; name: string; category: string | null; address: string | null; lat: number | null; lng: number | null; place_url: string | null;
  my_first_at: string | null; users: number | null; revisit_rate: number | null;
};

export const useMyTours = () =>
  useQuery({
    queryKey: ["rec", "tours"],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_tours");
      if (error) throw new Error(error.message);
      return (data ?? []) as Tour[];
    },
  });

export const useTourDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ["rec", "tour", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tour_detail", { p_tour: id });
      if (error) throw new Error(error.message);
      return (data ?? []) as TourPlace[];
    },
  });

export const useTourWeekly = (id: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["rec", "tour-weekly", id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tour_weekly", { p_tour: id });
      if (error) throw new Error(error.message);
      return (data ?? []) as { week_start: string; n: number }[];
    },
  });

/* ───────────── 지금 있는 곳 ───────────── */

/**
 * 지금 자리와 동네 이름. 위치 권한을 거부하면 가장 자주 인증한 동네의 가운데로 대신하고 fallback = true(§12).
 * 상세 화면들이 같은 자리로 다시 셀 수 있게 store.recHere 에도 둡니다.
 */
export function useRecHere(rows: Restaurant[]) {
  const [here, setHere] = useState<RecHere | null>(getState().recHere);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        if (alive) setDenied(true);
        return;
      }
      const pos = (await Location.getLastKnownPositionAsync().catch(() => null))
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      if (!pos || !alive) return;
      const { latitude: lat, longitude: lng } = pos.coords;
      const next: RecHere = { lat, lng, name: getState().recHere?.name ?? null, fallback: false };
      setHere(next);
      setState({ recHere: next });
      const place = await reverseGeocode(lat, lng).catch(() => null);
      const name = place ? areaOf(place.address, place.region) : null;
      if (alive && name) {
        const named = { ...next, name };
        setHere(named);
        setState({ recHere: named });
      }
    })();
    return () => { alive = false; };
  }, []);

  // 권한이 없으면 자주 인증한 동네로.
  const spot = denied ? frequentSpot(rows) : null;
  useEffect(() => {
    if (!spot) return;
    const next: RecHere = { lat: spot.lat, lng: spot.lng, name: spot.name, fallback: true };
    setHere(next);
    setState({ recHere: next });
  }, [spot?.name, spot?.lat, spot?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return { here, denied };
}

/**
 * 추천 기준 — 머리에서 고른 자리 · 시각이 있으면 그것, 없으면 지금 위치(store.recHere) · 지금 시각(at = null).
 * 코스 · 투어 상세가 탭과 같은 기준으로 셉니다.
 */
export function useRecPoint() {
  const { recHere, recPlace, recAt } = useAppState();
  return { here: recPlace ?? recHere, at: recAt };
}

/** 길 안내 — 네이버 지도 앱 도보 길찾기, 앱이 없으면 웹 검색. */
export function openDirections(p: { name: string; lat: number; lng: number }) {
  const app = `nmap://route/walk?dlat=${p.lat}&dlng=${p.lng}&dname=${encodeURIComponent(p.name)}&appname=app.dinary`;
  Linking.openURL(app).catch(() => Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(p.name)}`).catch(() => {}));
}

/** 이 가게가 후보인 열린 투어 — 촬영 완료 화면의 「평양냉면 투어 3/3 완주」(§10). */
export const useToursAt = (placeKey: string | null) =>
  useQuery({
    queryKey: ["rec", "tours-at", placeKey],
    enabled: !!placeKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("tour_places").select("tour_id").eq("place_key", placeKey!);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.tour_id as string);
    },
  });

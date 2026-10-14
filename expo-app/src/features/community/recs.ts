import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { metersBetweenLL, norm } from "@/lib/geo";
import { regionFromAddress } from "@/lib/regions";
import { coverPhoto, matchWish, type Kind, type Restaurant, type Wish } from "@/lib/types";
import type { PublicProfile, SharedRecord } from "./api";

/**
 * 추천(핸드오프 §6) — 친구 · 전체 공개 기록에서 가게를 모아, 내 기록과 닮은 정도로 고릅니다.
 * 모든 추천에 왜 골랐는지 붙이고, 이미 기록한 곳 · 이미 담은 곳은 뺍니다. 「관심 없음」으로 숨긴 곳은 빼고 그 종류는 덜 올립니다.
 */

export type Rec = {
  place: string;
  name: string;
  kind: Kind;
  category: string | null;
  address: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  photo: string | null;
  friendIds: string[];
  avgRating: number | null;
  /** 첫 번째 이유는 강조(벽돌 바탕), 둘째는 회색 칩 — 「이런 곳도」 줄은 첫 번째만 씁니다. */
  reasons: string[];
  sameCategory: number;
  distanceM: number | null;
  score: number;
};

export type Dislikes = { places: string[]; categories: Record<string, number> };
const KEY = "community.recs.dislikes";

export function useDislikes() {
  const [d, setD] = useState<Dislikes>({ places: [], categories: {} });
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) try { setD(JSON.parse(v)); } catch {} }).catch(() => {});
  }, []);
  const dislike = (r: Rec) => {
    setD((prev) => {
      const next: Dislikes = {
        places: [...new Set([...prev.places, r.place])],
        categories: r.category ? { ...prev.categories, [r.category]: (prev.categories[r.category] ?? 0) + 1 } : prev.categories,
      };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  return { dislikes: d, dislike };
}

const lastToken = (gu: string) => gu.split(" ").pop() ?? gu;

export function buildRecs(opts: {
  shared: SharedRecord[];
  mine: Restaurant[];
  wishes: Wish[];
  friends: Map<string, PublicProfile>;
  dislikes: Dislikes;
  me: { lat: number; lng: number } | null;
}): Rec[] {
  const { shared, mine, wishes, friends, dislikes, me } = opts;
  const myNames = new Set(mine.map((r) => norm(r.name)));
  const myPlaces = new Set(mine.map((r) => r.place_key).filter(Boolean));
  const catCount = new Map<string, number>();
  const guCount = new Map<string, number>();
  for (const r of mine) {
    if (r.category) catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
    const gu = regionFromAddress(r.address);
    if (gu) guCount.set(gu, (guCount.get(gu) ?? 0) + 1);
  }

  const groups = new Map<string, SharedRecord[]>();
  for (const r of shared) {
    if (!r.verified) continue;
    if (dislikes.places.includes(r.place)) continue;
    if (myNames.has(norm(r.name)) || (r.place_key && myPlaces.has(r.place_key)) || matchWish(wishes, r.name)) continue;
    const g = groups.get(r.place);
    if (g) g.push(r); else groups.set(r.place, [r]);
  }

  const out: Rec[] = [];
  for (const [place, list] of groups) {
    const top = list.find((r) => coverPhoto(r)) ?? list[0];
    const friendIds = [...new Set(list.filter((r) => r.by_friend && friends.has(r.user_id)).map((r) => r.user_id))];
    const ratings = list.map((r) => r.rating).filter((v): v is number => v != null);
    const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    const sameCategory = top.category ? catCount.get(top.category) ?? 0 : 0;
    const gu = regionFromAddress(top.address);
    const myGu = gu ? guCount.get(gu) ?? 0 : 0;
    const distanceM = me && top.lat != null && top.lng != null ? metersBetweenLL(me.lat, me.lng, top.lat, top.lng) : null;

    const reasons: string[] = [];
    if (friendIds.length) reasons.push(avgRating != null ? `친구 ${friendIds.length}명 인증 · 평균 ${avgRating.toFixed(1)}` : `친구 ${friendIds.length}명 인증`);
    if (sameCategory >= 3) reasons.push(`${top.category} 기록 ${sameCategory}건과 비슷`);
    if (myGu >= 3 && gu) reasons.push(`자주 가는 동네 · ${lastToken(gu)}`);
    if (!friendIds.length) reasons.push(avgRating != null ? `DINARY 인증 ${list.length}건 · 평균 ${avgRating.toFixed(1)}` : `DINARY 인증 ${list.length}건`);

    const penalty = top.category ? dislikes.categories[top.category] ?? 0 : 0;
    const score =
      friendIds.length * 3 + (avgRating ?? 3) + Math.min(sameCategory, 10) * 0.3 + (myGu >= 3 ? 1.2 : 0) + list.length * 0.2 - penalty * 1.5
      + (distanceM != null ? Math.max(0, 2 - distanceM / 2000) : 0);

    out.push({
      place, name: top.name, kind: top.kind, category: top.category, address: top.address, region: top.region,
      lat: top.lat, lng: top.lng, photo: coverPhoto(top), friendIds, avgRating, reasons, sameCategory, distanceM, score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 이번 주(월요일 시작) 번호 — 「이번 주 하나」가 월요일마다 바뀌게 순서를 돌립니다. */
export function weekIndex(d = new Date()) {
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Math.floor(monday.getTime() / (7 * 86400000));
}

export const km = (m: number | null) => (m == null ? null : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

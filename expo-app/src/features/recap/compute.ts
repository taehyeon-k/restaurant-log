import { LABELS, regionTitles, type LabelDef, type RegionTier } from "@/lib/labels";
import { ALL_CATEGORIES, coverPhoto, pinColor, type Restaurant, type Wish } from "@/lib/types";
import {
  currentQuarter, eulReul, ieosseoyo, mmdd, nativeCount, quarterOfDate, quarterRange, seasonOf, seoulParts, seoulToday,
  shiftQuarter, type QuarterId,
} from "./seasons";

/**
 * 분기 리캡 데이터 — HANDOFF quarterly recap §1 Slides · §3 Data.
 * 모두 기기에서 계산하는 순수 함수입니다. 기록 = 대기(pending)가 아니고 visited_at 이 분기 안인 restaurants.
 */

const placeKey = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** "서울 성동구" · "성동구" · 주소에서 구(군·시) 이름만. */
export function districtOf(r: Pick<Restaurant, "region" | "address">) {
  const pick = (s: string | null) => {
    const parts = (s ?? "").trim().split(/\s+/).filter(Boolean);
    return parts.find((p, i) => i > 0 && /[구군]$/.test(p)) ?? parts.find((p) => /[구군]$/.test(p)) ?? null;
  };
  return pick(r.region) ?? pick(r.address) ?? (r.region?.trim().split(/\s+/).pop() || null);
}

/** 국물 있는 한 그릇 — 이름·메뉴에서 찾습니다. */
const SOUP = /(국밥|국수|떡국|만둣국|미역국|순대국|해장국|된장국|북엇국|육개장|탕(?!수)|찌개|전골|라멘|라면|우동|짬뽕|수제비|샤브|훠궈|냉면|밀면|소바|곰국)/;
const dishOf = (r: Restaurant) => r.menu?.trim() || r.menus?.[0]?.name?.trim() || "";
const isSoup = (r: Restaurant) => SOUP.test(`${r.name} ${dishOf(r)} ${(r.menus ?? []).map((m) => m.name).join(" ")}`);

/** 기록 시각 — 인증 시각이 있으면 그것, 없으면 만든 시각(한국 시간). */
const stampOf = (r: Restaurant) => seoulParts(r.verified_at ?? r.created_at);

const WEEKDAY = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const median = (list: number[]) => {
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const daysBetween = (fromKey: string, toKey: string) =>
  Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);

type PlaceGroup = { key: string; rows: Restaurant[]; first: string; last: string };

function groupPlaces(rows: Restaurant[]): PlaceGroup[] {
  const map = new Map<string, Restaurant[]>();
  for (const r of rows) {
    const k = placeKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (a.visited_at! < b.visited_at! ? -1 : a.visited_at! > b.visited_at! ? 1 : a.created_at < b.created_at ? -1 : 1));
      return { key, rows: sorted, first: sorted[0].visited_at!, last: sorted[sorted.length - 1].visited_at! };
    })
    // 많이 간 곳 먼저, 같으면 마지막 방문이 최근인 곳.
    .sort((a, b) => b.rows.length - a.rows.length || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

/** 가장 최근 기록의 대표사진, 없으면 사진이 있는 다른 기록. */
const photoOf = (g: PlaceGroup) => {
  for (let i = g.rows.length - 1; i >= 0; i--) {
    const p = coverPhoto(g.rows[i]);
    if (p) return p;
  }
  return null;
};

/* ── 결과 모양 ─────────────────────────────────────── */

export type TopPlace = {
  name: string;
  category: string | null;
  where: string | null;
  district: string | null;
  count: number;
  photo: string | null;
  first: string;
  last: string;
  avg: number | null;
};

export type LabelProgress = { def: LabelDef; have: number; need: number };
export type NextCard = { title: string; right: string; body: string; seasonal?: boolean };
export type OddItem = { kicker: string; title: string; sub: string };

export type RecapData = {
  quarter: QuarterId;
  count: number;
  prev: { count: number; diff: number } | null;
  newPlaces: number;
  repeatPlaces: number;
  verified: number;
  verifiedRate: number;
  labels: {
    earned: { def: LabelDef; date: string }[];
    near: LabelProgress[];
    total: number;
    all: number;
  };
  top: TopPlace;
  top5: TopPlace[] | null;
  top5Insight: string | null;
  districts: {
    top: string;
    bars: { name: string; count: number }[];
    title: { region: string; tier: RegionTier } | null;
    fresh: string[];
  } | null;
  taste: {
    soup: boolean;
    title: string;
    sub: string;
    segments: { label: string; color: string; count: number }[];
    untried: string[];
    palate: { have: number; need: number; earned: boolean };
    word: string;
  };
  time: { peak: string; hist: number[]; peakIndex: number; day: string; dayCount: number; midnight: number };
  persona: { explorer: boolean; ratio: number; newCount: number; repeatCount: number; regular: string | null; prevRatio: number | null };
  memo: { id: number; text: string; place: string; date: string; rating: number | null; photo: string | null; category: string | null } | null;
  wish: {
    visited: number;
    total: number;
    fastest: { name: string; days: number } | null;
    oldest: { name: string; days: number; query: string } | null;
  } | null;
  odd: OddItem[] | null;
  next: { cards: NextCard[]; openWishes: number } | null;
};

/* ── 분기 목록 ─────────────────────────────────────── */

export type RecapSummary = { quarter: QuarterId; count: number; topPlace: string | null };

const liveRows = (rows: Restaurant[]) => rows.filter((r) => !r.pending && !!r.visited_at);

/** 리캡이 있는 분기 — 이미 끝났고 기록이 1건 이상. 최신순. */
export function listRecapQuarters(rows: Restaurant[], now = new Date()): RecapSummary[] {
  const current = currentQuarter(now);
  const byQ = new Map<QuarterId, Restaurant[]>();
  for (const r of liveRows(rows)) {
    const q = quarterOfDate(r.visited_at!);
    if (q >= current) continue;
    if (!byQ.has(q)) byQ.set(q, []);
    byQ.get(q)!.push(r);
  }
  return [...byQ.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([quarter, list]) => ({ quarter, count: list.length, topPlace: groupPlaces(list)[0]?.rows[0].name ?? null }));
}

/** 캘린더 카드·초대장에 쓰는 「막 끝난 분기」 리캡 — 바로 앞 분기에 기록이 없으면 null. */
export function latestRecap(rows: Restaurant[], now = new Date()): RecapSummary | null {
  const prevQ = shiftQuarter(currentQuarter(now), -1);
  return listRecapQuarters(rows, now).find((s) => s.quarter === prevQ) ?? null;
}

/* ── 라벨 ─────────────────────────────────────── */

const countAt = (def: LabelDef, rows: Restaurant[], until: string) => def.count(rows.filter((r) => r.visited_at! <= until));

/** 분기 안에서 처음 조건을 채운 날 — 날짜 순으로 그날까지의 기록을 다시 셉니다. */
function earnedInQuarter(def: LabelDef, all: Restaurant[], start: string, end: string): string | null {
  const before = shiftDay(start, -1);
  if (countAt(def, all, before) >= def.need) return null;
  if (countAt(def, all, end) < def.need) return null;
  const days = [...new Set(all.map((r) => r.visited_at!).filter((d) => d >= start && d <= end))].sort();
  return days.find((d) => countAt(def, all, d) >= def.need) ?? end;
}

function shiftDay(key: string, delta: number) {
  const d = new Date(Date.parse(`${key}T00:00:00Z`) + delta * 86400000);
  return d.toISOString().slice(0, 10);
}

/* ── 계산 ─────────────────────────────────────── */

export function computeRecap(allRows: Restaurant[], wishes: Wish[], quarter: QuarterId, now = new Date()): RecapData | null {
  const season = seasonOf(quarter);
  const { start, end } = quarterRange(quarter);
  const all = liveRows(allRows);
  const records = all.filter((r) => r.visited_at! >= start && r.visited_at! <= end);
  if (!records.length) return null;
  const upToEnd = all.filter((r) => r.visited_at! <= end);
  const beforeStart = all.filter((r) => r.visited_at! < start);

  // 석 달의 숫자
  const prevQ = shiftQuarter(quarter, -1);
  const prevRange = quarterRange(prevQ);
  const prevRows = all.filter((r) => r.visited_at! >= prevRange.start && r.visited_at! <= prevRange.end);
  const groups = groupPlaces(records);
  const seenBefore = new Set(beforeStart.map(placeKey));
  const newPlaces = groups.filter((g) => !seenBefore.has(g.key)).length;
  const repeatPlaces = groups.filter((g) => g.rows.length >= 2).length;
  const verified = records.filter((r) => r.verified).length;

  // 라벨
  const earned = LABELS.map((def) => ({ def, date: earnedInQuarter(def, all, start, end) }))
    .filter((e): e is { def: LabelDef; date: string } => !!e.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const progress = LABELS.map((def) => ({ def, have: def.count(upToEnd), need: def.need }));
  const near = progress
    .filter((p) => p.have < p.need && p.have > 0)
    .sort((a, b) => b.have / b.need - a.have / a.need)
    .slice(0, 2);

  // 가장 자주 간 곳 · 다섯 곳
  const toTop = (g: PlaceGroup): TopPlace => {
    const latest = g.rows[g.rows.length - 1];
    const rated = g.rows.map((r) => r.rating).filter((n): n is number => n != null);
    return {
      name: latest.name,
      category: latest.category,
      where: latest.address ?? latest.region,
      district: districtOf(latest),
      count: g.rows.length,
      photo: photoOf(g),
      first: g.first,
      last: g.last,
      avg: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    };
  };
  const top = toTop(groups[0]);
  const top5 = groups.length >= 2 ? groups.slice(0, 5).map(toTop) : null;
  let top5Insight: string | null = null;
  if (top5) {
    const byD = new Map<string, number>();
    for (const t of top5) if (t.district) byD.set(t.district, (byD.get(t.district) ?? 0) + 1);
    const [d, n] = [...byD.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (d && n >= 3) top5Insight = `${nativeCount(top5.length)} 곳 중 ${nativeCount(n)} 곳이 ${d}에 있어요.`;
  }

  // 동네
  const dCount = new Map<string, number>();
  for (const r of records) {
    const d = districtOf(r);
    if (d) dCount.set(d, (dCount.get(d) ?? 0) + 1);
  }
  const dSorted = [...dCount.entries()].sort((a, b) => b[1] - a[1]);
  let districts: RecapData["districts"] = null;
  if (dSorted.length) {
    const bars = dSorted.slice(0, 4).map(([name, count]) => ({ name, count }));
    const rest = dSorted.slice(4).reduce((n, [, c]) => n + c, 0);
    if (rest > 0) bars.push({ name: "그 외", count: rest });
    const topD = dSorted[0][0];
    const tierAt = (list: Restaurant[]) => regionTitles(list).find((t) => t.region === topD)?.tier ?? null;
    const tierNow = tierAt(upToEnd);
    const tierBefore = tierAt(beforeStart);
    const knownBefore = new Set(beforeStart.map(districtOf).filter(Boolean));
    districts = {
      top: topD,
      bars,
      title: tierNow && tierNow.need !== tierBefore?.need ? { region: topD, tier: tierNow } : null,
      fresh: dSorted.map(([n]) => n).filter((n) => !knownBefore.has(n)),
    };
  }

  // 입맛
  const cCount = new Map<string, number>();
  for (const r of records) {
    const c = r.category ?? "기타";
    cCount.set(c, (cCount.get(c) ?? 0) + 1);
  }
  const cSorted = [...cCount.entries()].sort((a, b) => b[1] - a[1]);
  const segments = cSorted.map(([label, count]) => ({ label, count, color: label === "기타" ? "#8a8377" : pinColor(label) }));
  const soupRows = records.filter(isSoup);
  const soup = soupRows.length / records.length >= 0.4;
  const topCat = cSorted.find(([c]) => c !== "기타")?.[0] ?? cSorted[0][0];
  const topCatCount = cCount.get(topCat) ?? 0;
  const dishes = [...new Set(soupRows.map((r) => dishOf(r) || r.name))].slice(0, 3);
  const everCats = new Set(upToEnd.map((r) => r.category).filter(Boolean));
  const palateDef = LABELS.find((l) => l.id === "palate")!;
  const palateHave = palateDef.count(upToEnd);
  const taste = {
    soup,
    title: soup ? `국물을 따라다닌\n${ieosseoyo(season.name)}` : `${eulReul(topCat)} 가장 많이\n찾은 ${season.name}`,
    sub: soup
      ? `${dishes.join(", ")}… ${records.length}끼 중 ${soupRows.length}끼가 국물 있는 한 그릇.`
      : `${records.length}끼 중 ${topCatCount}끼가 ${topCat}.`,
    segments,
    untried: ALL_CATEGORIES.filter((c) => !everCats.has(c)),
    palate: { have: palateHave, need: palateDef.need, earned: palateHave >= palateDef.need },
    word: soup ? "국물파" : `${topCat}파`,
  };

  // 시각
  const buckets = new Map<string, number>();
  const hist = new Array(18).fill(0) as number[];
  let midnight = 0;
  const wd = new Array(7).fill(0) as number[];
  for (const r of records) {
    const t = stampOf(r);
    const k = `${String(t.hour).padStart(2, "0")}:${String(Math.floor(t.minute / 10) * 10).padStart(2, "0")}`;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
    // 07시 … 23시 + 마지막 칸은 자정 이후(00–06시)
    hist[t.hour >= 7 ? t.hour - 7 : 17]++;
    if (t.hour < 4) midnight++;
    wd[new Date(`${r.visited_at}T00:00:00Z`).getUTCDay()]++;
  }
  const peak = [...buckets.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  const peakIndex = hist.indexOf(Math.max(...hist));
  const dayIdx = wd.indexOf(Math.max(...wd));

  // 단골 ↔ 탐험가
  const ratio = groups.length ? newPlaces / groups.length : 0;
  const prevGroups = groupPlaces(prevRows);
  const seenBeforePrev = new Set(all.filter((r) => r.visited_at! < prevRange.start).map(placeKey));
  const prevRatio = prevGroups.length ? prevGroups.filter((g) => !seenBeforePrev.has(g.key)).length / prevGroups.length : null;

  // 가장 긴 메모
  const memoRow = [...records]
    .filter((r) => (r.review ?? "").trim().length >= 40)
    .sort((a, b) => (b.review ?? "").trim().length - (a.review ?? "").trim().length)[0];
  const memo = memoRow
    ? {
        id: memoRow.id,
        text: memoRow.review!.trim(),
        place: memoRow.name,
        date: memoRow.visited_at!,
        rating: memoRow.rating,
        photo: coverPhoto(memoRow),
        category: memoRow.category,
      }
    : null;

  // 위시 → 방문 (만난 위시는 지워지므로, 남은 위시 + 분기 안에 위시에서 온 기록을 함께 셉니다)
  const today = seoulToday(now);
  const fromWish = records.filter((r) => r.from_wish);
  const visitedKeys = new Set(fromWish.map(placeKey));
  const openBefore = wishes.filter((w) => w.saved_at.slice(0, 10) <= end);
  const wishTotal = openBefore.length + visitedKeys.size;
  const fastestRow = [...fromWish].sort((a, b) => a.from_wish!.days - b.from_wish!.days)[0];
  const oldestWish = [...openBefore].sort((a, b) => (a.saved_at < b.saved_at ? -1 : 1))[0];
  const wish = wishTotal
    ? {
        visited: visitedKeys.size,
        total: wishTotal,
        fastest: fastestRow ? { name: fastestRow.name, days: fastestRow.from_wish!.days } : null,
        oldest: oldestWish
          ? { name: oldestWish.name, days: Math.max(0, daysBetween(oldestWish.saved_at.slice(0, 10), today)), query: [oldestWish.name, oldestWish.where_text].filter(Boolean).join(" ") }
          : null,
      }
    : null;

  // 의외의 순간 (비 오는 날은 날씨 자료가 없어 넣지 않습니다)
  const odd: OddItem[] = [];
  const coords = all.filter((r) => r.lat != null && r.lng != null);
  if (coords.length >= 3) {
    const mLat = median(coords.map((r) => r.lat!));
    const mLng = median(coords.map((r) => r.lng!));
    const far = records
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({ r, m: metersBetween(mLat, mLng, r.lat!, r.lng!) }))
      .sort((a, b) => b.m - a.m)[0];
    if (far && far.m >= 10000) {
      odd.push({ kicker: "가장 멀리 간 한 끼", title: far.r.name, sub: `평소 동네에서 ${Math.round(far.m / 1000)}km · ${mmdd(far.r.visited_at!)}` });
    }
  }
  const byDay = new Map<string, Restaurant[]>();
  for (const r of records) byDay.set(r.visited_at!, [...(byDay.get(r.visited_at!) ?? []), r]);
  const busiest = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0];
  if (busiest && busiest[1].length >= 3) {
    const [, m, d] = busiest[0].split("-").map(Number);
    const seq = [...busiest[1]].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((r) => dishOf(r) || r.name);
    odd.push({ kicker: "하루에 가장 많이 남긴 날", title: `${m}월 ${d}일, ${nativeCount(busiest[1].length)} 곳`, sub: seq.join(" → ") });
  }
  const longWait = [...fromWish].sort((a, b) => b.from_wish!.days - a.from_wish!.days)[0];
  if (longWait && longWait.from_wish!.days >= 14) {
    odd.push({ kicker: "가장 오래 기다린 한 끼", title: longWait.name, sub: `담아두고 ${longWait.from_wish!.days}일 만에 · ${mmdd(longWait.visited_at!)}` });
  }
  const catsBefore = new Set(beforeStart.map((r) => r.category).filter(Boolean));
  const firstNew = [...records]
    .filter((r) => r.category && !catsBefore.has(r.category))
    .sort((a, b) => (a.visited_at! < b.visited_at! ? -1 : 1))[0];
  if (firstNew && beforeStart.length) {
    odd.push({ kicker: "처음 열어 본 분류", title: `${firstNew.category} · ${firstNew.name}`, sub: mmdd(firstNew.visited_at!) });
  }

  // 다음 분기
  const nextQ = shiftQuarter(quarter, 1);
  const nextSeasonal = parseInt(nextQ.slice(-1), 10) === 4;
  const regular = groups[0];
  const candidates: (NextCard & { ratio: number })[] = progress
    .filter((p) => p.have < p.need && p.have > 0 && p.def.id !== "december")
    .map((p) => ({
      title: p.def.name,
      right: `${p.have} / ${p.need}`,
      body:
        p.def.id === "regular" && regular
          ? `${regular.rows[0].name}에 ${nativeCount(p.need - p.have)} 번만 더 가면 받아요`
          : `${p.def.desc} · ${p.need - p.have}개 남았어요`,
      ratio: p.have / p.need,
    }));
  for (const t of regionTitles(upToEnd)) {
    if (!t.next) continue;
    candidates.push({
      title: `${t.region} ${t.next.suffix}`,
      right: `${t.have} / ${t.next.need}`,
      body: `${t.region}에서 인증 ${nativeCount(t.next.need - t.have)} 번`,
      ratio: t.have / t.next.need,
    });
  }
  candidates.sort((a, b) => b.ratio - a.ratio);
  const december = progress.find((p) => p.def.id === "december");
  const seasonal = nextSeasonal && december && december.have < december.need;
  const cards: NextCard[] = candidates.slice(0, seasonal ? 2 : 3).map(({ ratio: _r, ...c }) => c);
  if (seasonal) cards.push({ title: december!.def.name, right: "12월에 열려요", body: `${december!.def.desc} · 이 분기에만 받을 수 있어요`, seasonal: true });

  return {
    quarter,
    count: records.length,
    prev: prevRows.length ? { count: prevRows.length, diff: records.length - prevRows.length } : null,
    newPlaces,
    repeatPlaces,
    verified,
    verifiedRate: Math.round((verified / records.length) * 100),
    labels: {
      earned,
      near,
      total: progress.filter((p) => p.have >= p.need).length,
      all: LABELS.length,
    },
    top,
    top5,
    top5Insight,
    districts,
    taste,
    time: { peak, hist, peakIndex, day: WEEKDAY[dayIdx], dayCount: wd[dayIdx], midnight },
    persona: {
      explorer: ratio >= 0.5,
      ratio,
      newCount: newPlaces,
      repeatCount: repeatPlaces,
      regular: regular && regular.rows.length >= 2 ? regular.rows[0].name : null,
      prevRatio,
    },
    memo,
    wish,
    odd: odd.length >= 2 ? odd.slice(0, 3) : null,
    next: cards.length ? { cards, openWishes: wishes.length } : null,
  };
}

import BottomSheet, { BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { NaverMapPolygonOverlay, type NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, BurstIcon, LocateIcon, SearchIcon } from "@/components/icons";
import { PaperMap } from "@/components/PaperMap";
import { DraftsBoxIcon } from "@/components/DraftsBoxIcon";
import { useActiveBook, useAnniversaryPicks, useRecordNotes, type BookMember } from "@/data/books";
import { useRows, useWishes } from "@/data/queries";
import { setState, useAppState, type MarkerFilter } from "@/data/store";

import { BuildingTagMarker, GhostMarker, NumberPin, RecordMarker, TapPointMarker, WishMarker } from "@/features/map/Markers";
import { revealZooms } from "@/features/map/labelZoom";
import { Pair } from "@/features/couple/Avatars";
import BookDrawer, { MenuLines } from "@/features/couple/BookDrawer";
import PlaceCard, { type CoupleCardInfo } from "@/features/map/PlaceCard";
import PlacesAtSheet from "@/features/map/PlacesAtSheet";
import { recordsAt, usePlacesAt, type PlaceAt } from "@/features/map/usePlacesAt";
import PlaceSearch from "@/features/map/PlaceSearch";
import { SegmentSwitch, useWishItems, WishRow, type WishItem } from "@/features/map/WishSegment";
import RecapInvite from "@/features/recap/RecapInvite";
import { FilterSheet as FilterSheetImpl, FoundSheet, SearchMissSheet } from "@/features/map/Sheets";
import { dayCount, mealLabels } from "@/lib/anniversary";
import type { Place as GeocodePlace } from "@/lib/geocode";
import { findRecord, findWish, norm } from "@/lib/geo";
import { groupPlaces, type Place } from "@/lib/places";
import { inRegion, inSearchedRegion, matchRegionName, regionFromSearch, regionNamesFrom } from "@/lib/regions";
import { matchWish, type Kind, type Restaurant, type Sort } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "최근순" },
  { value: "rating", label: "별점순" },
  { value: "price", label: "가격순" },
];

const FILTERS: { id: MarkerFilter; label: string }[] = [
  { id: "all", label: "둘 다" },
  { id: "visited", label: "기록만" },
  { id: "wish", label: "위시리스트만" },
];

/** 지도 콘텐츠 패딩(아래) — 카메라 중심을 시트 위로 올려둡니다. */
const MAP_PAD_BOTTOM = 320;
/** 웹 MobileShell 과 같은 네 단계 — peek 96 · 35% · 75% · full(화면 − 84). 처음엔 75% 로 엽니다. */
/** 시트가 이보다 낮으면 머리를 한 줄(맛집 기록 · 가게 N · 기록 M)로 줄입니다 — 웹 COMPACT_BELOW. */
const COMPACT_BELOW = 200;
/** 지도 위 단추들이 시트 윗변에서 띄우는 간격. 마커 필터는 웹(14)보다 24 높게 — 왼쪽 아래 네이버 로고를 가리면 약관 위반입니다. */
const GAP_FILTER = 38;
const GAP_DRAFTS = 14;
const GAP_PLUS = 16;
const FILTER_H = 38;
const DRAFTS_H = 56;
const PLUS_H = 52;
const LOCATE_H = 44;
/** 지도 탭 시트의 최대 높이(화면 비율) — 위쪽에 누른 자리가 보이게 남깁니다. */
const PLACES_SHEET_RATIO = 0.56;

type Bounds = { s: number; w: number; n: number; e: number };
type Pt = [number, number];
const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((v): v is string => !!v))];

/** 지도 탭 — 네이버 지도 + 기록 목록 시트. 웹 MobileShell 의 지도 화면 상태를 그대로 옮겼습니다. */
export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const router = useRouter();
  const { data: allRows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { kind, markerFilter: pickedFilter, ghost, mapSegment } = useAppState();
  // 위시리스트를 보는 동안 핀은 「위시리스트만」과 같게 — 기록으로 돌리면 고른 필터로 돌아옵니다.
  const markerFilter: MarkerFilter = mapSegment === "wish" ? "wish" : pickedFilter;
  const wishItems = useWishItems(wishes);

  // 다른 화면의 「위시에 담기」 등이 지도를 segment=wish 로 열 수 있습니다.
  const { segment } = useLocalSearchParams<{ segment?: string }>();
  useEffect(() => {
    if (segment === "wish" || segment === "records") setState({ mapSegment: segment });
  }, [segment]);
  const qc = useQueryClient();
  // 지금 고른 기록장(HANDOFF-couple §3-1). 연인 기록이면 시트 제목·카드·말풍선이 바뀝니다.
  const { book, isCouple, me: meMember, partner } = useActiveBook();
  const { data: notes = [] } = useRecordNotes();
  const { data: picks = [] } = useAnniversaryPicks();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 상대가 찍은 기록이 바로 보이게 — 연인 기록이면 지도 탭에 돌아올 때마다 다시 읽습니다.
  useFocusEffect(useCallback(() => {
    if (!isCouple) return;
    void qc.invalidateQueries({ queryKey: ["restaurants", book?.id] });
    void qc.invalidateQueries({ queryKey: ["record_notes"] });
  }, [isCouple, book?.id, qc]));

  const mapRef = useRef<NaverMapViewRef>(null);
  const regionRef = useRef<Bounds | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const lastFit = useRef("");
  const holdFit = useRef(false);

  // 네이버 로고는 왼쪽 위 귀퉁이(콘텐츠 패딩 top = insets.top+62, 검색줄 바로 아래)에 고정합니다. 음수 margin 은 영역 밖이라 로고가 사라집니다. 로고를 가리면 약관 위반입니다.
  const screenH = useSharedValue(0);
  const sheetTop = useSharedValue(0); // 시트 윗변의 y — BottomSheet 가 매 프레임 채웁니다.

  const [layoutH, setLayoutH] = useState(0);
  // 시트는 아무 높이에서나 멈추게: 최소~최대 사이를 6px 간격으로 촘촘히 깔아, 손을 뗀 자리 가장 가까운 곳에 섭니다.
  const sheetSnaps = useMemo(() => {
    const H = layoutH || windowH;
    const max = Math.max(260, H - 84);
    const pts: number[] = [];
    for (let y = 96; y < max; y += 6) pts.push(y);
    pts.push(max);
    return pts;
  }, [layoutH, windowH]);
  const sheetStartIndex = useMemo(() => {
    const target = (layoutH || windowH) * 0.75;
    return sheetSnaps.reduce((best, y, i) => (Math.abs(y - target) < Math.abs(sheetSnaps[best] - target) ? i : best), 0);
  }, [sheetSnaps, layoutH, windowH]);
  const sheetIndex = useRef(sheetStartIndex);

  // 지도 위 단추들은 시트 윗변을 따라 오르내립니다. 검색줄 위로는 올라가지 않습니다.
  const minTop = insets.top + 8 + 46 + 12;
  const filterStyle = useAnimatedStyle(() => ({ top: Math.max(minTop, sheetTop.value - GAP_FILTER - FILTER_H) }));
  const draftsStyle = useAnimatedStyle(() => ({ top: Math.max(minTop, sheetTop.value - GAP_DRAFTS - DRAFTS_H) }));
  const locateStyle = useAnimatedStyle(() => ({ top: Math.max(minTop, sheetTop.value - GAP_DRAFTS - DRAFTS_H - 10 - LOCATE_H) }));
  const plusStyle = useAnimatedStyle(() => ({ top: Math.max(minTop, sheetTop.value - GAP_PLUS - PLUS_H) }));
  // + 메뉴는 위로 펼칩니다 — 아랫변이 + 단추 아랫변보다 60 위(웹과 같음).
  const plusMenuStyle = useAnimatedStyle(() => ({ bottom: screenH.value - Math.max(minTop, sheetTop.value - GAP_PLUS - PLUS_H) - PLUS_H + 60 }));

  const [compact, setCompact] = useState(false);
  useAnimatedReaction(
    () => screenH.value > 0 && sheetTop.value > 0 && screenH.value - sheetTop.value < COMPACT_BELOW,
    (v, prev) => { if (v !== prev) scheduleOnRN(setCompact, v); },
  );

  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapMoved, setMapMoved] = useState(false);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(12);
  const [regionView, setRegionView] = useState<{ name: string; count: number } | null>(null);
  const [foundHit, setFoundHit] = useState<{ restaurant: Restaurant; place: Place } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const placesAt = usePlacesAt();

  /* ── 데이터 ─────────────────────────────────── */

  const pendingRows = useMemo(() => allRows.filter((r) => r.pending), [allRows]);
  const visibleRows = useMemo(() => allRows.filter((r) => !r.pending), [allRows]);
  const regionNames = useMemo(() => regionNamesFrom(visibleRows), [visibleRows]);
  const placesByKind = useMemo(
    () => ({
      restaurant: groupPlaces(visibleRows.filter((r) => r.kind === "restaurant")),
      cafe: groupPlaces(visibleRows.filter((r) => r.kind === "cafe")),
    }),
    [visibleRows]
  );
  const inKind = useMemo(() => visibleRows.filter((r) => r.kind === kind), [visibleRows, kind]);
  const allPlaces = placesByKind[kind];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (p: Place) =>
      !needle ||
      [p.name, p.region, p.category, p.address].some((f) => (f ?? "").toLowerCase().includes(needle)) ||
      p.visits.some((v) => [v.menu, v.review].some((f) => (f ?? "").toLowerCase().includes(needle)));

    const list = allPlaces
      .filter((p) => !viewBounds || (p.lat != null && p.lng != null && p.lat >= viewBounds.s && p.lat <= viewBounds.n && p.lng >= viewBounds.w && p.lng <= viewBounds.e))
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
  }, [allPlaces, q, categories, keywords, revisitOnly, verifiedOnly, viewBounds, sort]);

  const visitCount = useMemo(() => filtered.reduce((n, p) => n + p.visits.length, 0), [filtered]);

  /* ── 연인 기록 ─────────────────────────────── */

  const startedOn = isCouple ? book?.startedOn ?? null : null;
  /** 기념일 식사로 정해진 기록 id → 「1주년」 */
  const anniversaryTags = useMemo(
    () => (startedOn ? mealLabels(startedOn, picks, visibleRows) : new Map<number, string>()),
    [startedOn, picks, visibleRows]
  );
  const placeTag = useCallback((p: Place) => p.visits.map((v) => anniversaryTags.get(v.id)).find(Boolean), [anniversaryTags]);
  /** 최근 기록 기준으로 누가 한 줄을 썼는지 — 찍은 사람의 별점·메모도 그 사람의 한 줄로 봅니다. */
  const coupleInfo = useCallback((p: Place): CoupleCardInfo | undefined => {
    if (!isCouple) return undefined;
    const r = p.latest;
    const wrote = (m: BookMember | null) =>
      !!m && (notes.some((n) => n.record_id === r.id && n.user_id === m.userId && (n.rating != null || !!n.note)) ||
        (r.user_id === m.userId && (r.rating != null || !!r.review)));
    return { me: meMember, partner, meWrote: wrote(meMember), partnerWrote: wrote(partner), tag: placeTag(p) };
  }, [isCouple, notes, meMember, partner, placeTag]);
  const activeFilters = categories.length + keywords.length + (revisitOnly ? 1 : 0) + (verifiedOnly ? 1 : 0);
  const overlayOpen = filtersOpen || foundHit !== null || ghost !== null || regionView !== null || placesAt.state.status !== "idle";

  /* ── 지도 이동 ──────────────────────────────── */

  const flyTo = useCallback((lat: number, lng: number, z = 15) => {
    lastFit.current = `fly:${lat},${lng}`;
    mapRef.current?.animateCameraTo({ latitude: lat, longitude: lng, zoom: z, duration: 700 });
  }, []);

  const fitTo = useCallback((points: Pt[], maxZoomLike = 15) => {
    if (!points.length) return;
    if (points.length === 1) return flyTo(points[0][0], points[0][1], maxZoomLike);
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs);
    const padLat = Math.max((n - s) * 0.15, 0.002), padLng = Math.max((e - w) * 0.15, 0.002);
    mapRef.current?.animateRegionTo({
      latitude: s - padLat, longitude: w - padLng, latitudeDelta: n - s + padLat * 2, longitudeDelta: e - w + padLng * 2, duration: 500,
    });
  }, [flyTo]);

  // 다른 화면(커뮤니티 추천의 「지도에서 보기」)이 찍어 둔 자리로 갑니다. 검색으로 고른 때는 이미 그 자리라 그대로입니다.
  useEffect(() => {
    if (ghost && lastFit.current !== `fly:${ghost.lat},${ghost.lng}`) flyTo(ghost.lat, ghost.lng, 16);
  }, [ghost, flyTo]);

  // 목록(검색·필터) 결과가 바뀌면 지도를 그 범위에 맞춥니다 — 시트·지역 보기가 떠 있는 동안은 건너뜁니다.
  useEffect(() => {
    const pts = filtered.filter((p) => p.lat != null && p.lng != null);
    if (!pts.length) return;
    const key = pts.map((p) => p.key).join(",");
    if (key === lastFit.current) return;
    lastFit.current = key;
    if (overlayOpen || holdFit.current) { holdFit.current = false; return; }
    fitTo(pts.map((p) => [p.lat as number, p.lng as number]));
  }, [filtered, overlayOpen, fitTo]);

  async function locate() {
    Haptics.selectionAsync();
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    flyTo(pos.coords.latitude, pos.coords.longitude, 16);
  }

  const applyViewBounds = () => {
    if (!regionRef.current) return;
    holdFit.current = true;
    setViewBounds(regionRef.current);
    setMapMoved(false);
    if (sheetIndex.current <= 3) sheetRef.current?.snapToPosition("35%");
  };

  const clearAll = () => { setCategories([]); setKeywords([]); setRevisitOnly(false); setVerifiedOnly(false); setViewBounds(null); };

  /* ── 열기 ───────────────────────────────────── */

  const openPlace = useCallback((p: Place) => {
    setRegionView(null);
    setState({ kind: p.kind });
    // 방문이 하나면 곧바로 그 기록, 둘 이상이면 가게 화면.
    if (p.visits.length === 1) router.push({ pathname: "/record/[id]", params: { id: String(p.visits[0].id) } });
    else router.push({ pathname: "/place/[key]", params: { key: p.key } });
  }, [router]);

  const openWish = (id: string) => router.push({ pathname: "/wish/[id]", params: { id } });

  const newRecord = (p: { name?: string; address?: string; lat?: number; lng?: number; category?: string; revisit?: boolean; kind?: Kind }) =>
    router.push({
      pathname: "/record/edit",
      params: { kind: p.kind ?? kind, name: p.name ?? "", address: p.address ?? "", lat: p.lat != null ? String(p.lat) : "", lng: p.lng != null ? String(p.lng) : "", category: p.category ?? "", revisit: p.revisit ? "1" : "" },
    });

  const openWishPlan = (p: { name: string; where_text?: string; category?: string; lat?: number; lng?: number }) => {
    const dup = matchWish(wishes, p.name);
    if (dup) return openWish(dup.id);
    router.push({ pathname: "/wish/new", params: { name: p.name, where_text: p.where_text ?? "", category: p.category ?? "", lat: p.lat != null ? String(p.lat) : "", lng: p.lng != null ? String(p.lng) : "" } });
  };

  /* ── 지도 탭 → 그 건물 식당 ───────────────── */

  const placesSheetH = Math.round((layoutH || windowH) * PLACES_SHEET_RATIO);

  /** 누른 자리를 검색줄 아래 ~ 시트 위의 빈 곳 가운데에 둡니다. 카메라 중심(mapPadding 기준)에서 그만큼 남쪽을 봅니다. */
  const showAboveSheet = useCallback((lat: number, lng: number, z: number) => {
    const h = layoutH || windowH;
    const centerY = (insets.top + 62 + h - MAP_PAD_BOTTOM) / 2;
    const wantY = (insets.top + 62 + h - placesSheetH) / 2;
    const metersPerDp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    const dLat = ((centerY - wantY) * metersPerDp) / 111320;
    lastFit.current = `places:${lat},${lng}`;
    mapRef.current?.animateCameraTo({ latitude: lat - dLat, longitude: lng, zoom: z, duration: 450 });
  }, [layoutH, windowH, insets.top, placesSheetH]);

  /**
   * 지도 빈 곳을 누르면 — 네이버 지도의 onTapMap(네이티브가 좌표까지 줍니다). 핀을 누른 건 핀의 onTap 이 받으므로 여기로 오지 않습니다.
   * (길게 누르기는 네이티브 지도가 손가락을 가져가 JS 로 오지 않아서 짧은 탭으로 바꿨습니다.)
   */
  const openPlacesAt = placesAt.open;
  const onMapTap = useCallback((lat: number, lng: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlusOpen(false);
    openPlacesAt(lat, lng);
    showAboveSheet(lat, lng, Math.max(zoom, 17));
  }, [openPlacesAt, showAboveSheet, zoom]);

  const placesData = placesAt.state.status === "done" ? placesAt.state.data : null;
  const placesPoint = placesAt.state.status === "idle" ? null : placesAt.state.point;
  // 반경 100m 는 한 단계 멀리서 봅니다.
  useEffect(() => {
    if (placesData?.mode === "radius" && placesPoint) showAboveSheet(placesPoint.lat, placesPoint.lng, placesData.radius >= 100 ? 16.3 : 17);
  }, [placesData]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 건물 경계 — 닫는 점(첫 점과 같은 끝점)은 빼고 넘깁니다. */
  const footprint = useMemo(() => {
    const fp = placesData?.mode === "building" ? placesData.building.footprint : null;
    if (!fp || fp.length < 4) return null;
    const ring = fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1] ? fp.slice(0, -1) : fp;
    const top = Math.max(...ring.map((p) => p[0]));
    const midLng = (Math.min(...ring.map((p) => p[1])) + Math.max(...ring.map((p) => p[1]))) / 2;
    return { coords: ring.map(([latitude, longitude]) => ({ latitude, longitude })), label: { lat: top, lng: midLng } };
  }, [placesData]);

  const recordedAt = useCallback((p: PlaceAt) => (visibleRows.length ? recordsAt(p, visibleRows).length > 0 : p.myRecordCount > 0), [visibleRows]);

  /** 가게 줄 — 기록 1건이면 그 기록, 2건 이상이면 가게 화면, 없으면 기록 추가(그 화면의 50m 인증 규칙 그대로). */
  const pickPlaceAt = (p: PlaceAt, recs: Restaurant[]) => {
    placesAt.close();
    if (recs.length === 1) {
      setState({ kind: recs[0].kind });
      return router.push({ pathname: "/record/[id]", params: { id: String(recs[0].id) } });
    }
    if (recs.length > 1) {
      const top = groupPlaces(recs).sort((a, b) => b.visits.length - a.visits.length)[0];
      setState({ kind: top.kind });
      return router.push({ pathname: "/place/[key]", params: { key: top.key } });
    }
    newRecord({ name: p.name, address: p.addr ?? undefined, lat: p.lat, lng: p.lng, category: p.appCategory ?? undefined, kind: p.kind });
  };

  /* ── 검색 ───────────────────────────────────── */

  function enterRegionView(name: string, rowsInRegion: Restaurant[], fallback?: { lat: number; lng: number }) {
    setFoundHit(null); setPlusOpen(false); setState({ ghost: null });
    setMapQuery(""); setQ(""); clearAll(); setMapMoved(false);
    setRegionView({ name, count: rowsInRegion.length });
    const pts = rowsInRegion.filter((r) => r.lat != null && r.lng != null).map((r) => [r.lat as number, r.lng as number] as Pt);
    if (pts.length) fitTo(pts, 14);
    else if (fallback) flyTo(fallback.lat, fallback.lng, 13);
  }

  function choosePlace(p: GeocodePlace) {
    setRegionView(null);
    const hit = findRecord(visibleRows, p);
    if (hit) {
      setState({ ghost: null });
      const target = placesByKind[hit.kind].find((pl) => pl.visits.some((v) => v.id === hit.id));
      if (target) {
        if (target.lat != null && target.lng != null) flyTo(target.lat, target.lng, 16);
        setFoundHit({ restaurant: hit, place: target });
      }
      return;
    }
    // 기록에 없으면 위시에서 찾습니다 — 담아둔 곳을 "어느 쪽에도 없다"고 하면 안 됩니다.
    const wishHit = findWish(wishes, p);
    if (wishHit) {
      setState({ ghost: null });
      flyTo(wishHit.lat ?? p.lat, wishHit.lng ?? p.lng, 16);
      return openWish(wishHit.id);
    }
    // 가게·위시 어디에도 없으면 지역인지 봅니다 — 반드시 위 두 검사 다음입니다("중구식당"이 지역으로 빨려 들지 않게).
    const regionName = matchRegionName(p.name || p.address, regionNames);
    if (regionName) return enterRegionView(regionName, visibleRows.filter((r) => inRegion(r, regionName)), { lat: p.lat, lng: p.lng });
    if (!p.name) {
      const searched = regionFromSearch(p.address);
      if (searched) return enterRegionView(searched.label, visibleRows.filter((r) => inSearchedRegion(r, searched)), { lat: p.lat, lng: p.lng });
    }
    setState({ ghost: { name: p.name || p.address, address: p.address, lat: p.lat, lng: p.lng } });
    flyTo(p.lat, p.lng, 16);
  }

  /* ── 마커 ───────────────────────────────────── */

  const recordMarkers = useMemo(() => {
    const placed = (markerFilter === "wish" ? filtered.filter((p) => matchWish(wishes, p.name)) : filtered).filter((p) => p.lat != null && p.lng != null);
    return placed;
  }, [filtered, markerFilter, wishes]);
  const wishMarkers = useMemo(() => {
    if (markerFilter === "visited") return [];
    const names = new Set(filtered.map((p) => norm(p.name)));
    return wishes.filter((w) => w.lat != null && w.lng != null && !names.has(norm(w.name)));
  }, [wishes, filtered, markerFilter]);
  /** 마커마다 이름표가 나타나는 줌 — 이웃 이름표·핀과 안 겹치는 줌부터(labelZoom). */
  const reveal = useMemo(() => revealZooms([
    ...recordMarkers.map((p) => ({ id: `r:${p.key}`, lat: p.lat as number, lng: p.lng as number, name: p.name, kind: "record" as const, planned: !!matchWish(wishes, p.name) })),
    ...wishMarkers.map((w) => ({ id: `w:${w.id}`, lat: w.lat as number, lng: w.lng as number, name: w.name, kind: "wish" as const })),
  ]), [recordMarkers, wishMarkers, wishes]);
  const showLabel = (id: string) => zoom >= (reveal.get(id) ?? Infinity);

  /* ── 시트 ───────────────────────────────────── */

  const chipItems = [
    ...(viewBounds ? [{ key: "bounds", label: "이 지도 범위", onClear: () => setViewBounds(null) }] : []),
    ...categories.map((c) => ({ key: `cat:${c}`, label: c, onClear: () => setCategories((l) => l.filter((v) => v !== c)) })),
    ...keywords.map((k) => ({ key: `kw:${k}`, label: k, onClear: () => setKeywords((l) => l.filter((v) => v !== k)) })),
    ...(revisitOnly ? [{ key: "revisit", label: "재방문", onClear: () => setRevisitOnly(false) }] : []),
    ...(verifiedOnly ? [{ key: "verified", label: "인증된 기록", onClear: () => setVerifiedOnly(false) }] : []),
  ];

  const boundsChip = (small: boolean) => (
    <Pressable onPress={applyViewBounds} style={[s.boundsChip, small && { minHeight: 26, borderRadius: 13, paddingHorizontal: 9 }]}>
      <RefreshIcon size={small ? 10 : 11} />
      <Text style={{ fontFamily: F.sans, fontSize: small ? 10.5 : 11, color: C.brick }}>현 지도에 있는 기록만</Text>
    </Pressable>
  );
  const chipVisible = mapMoved && !overlayOpen;
  const title = isCouple ? "우리 기록" : kind === "cafe" ? "카페 기록" : "맛집 기록";
  const dPlus = startedOn ? `D+${dayCount(startedOn)}` : null;

  // 시트가 낮으면(peek) 한 줄 요약만 — 검색·칩·정렬은 숨깁니다(웹과 같음).
  const segmentSwitch = (
    <SegmentSwitch
      value={mapSegment}
      recordLabel={title}
      recordCount={filtered.length}
      wishCount={wishes.length}
      onChange={(v) => setState({ mapSegment: v })}
    />
  );

  const header = compact ? (
    <View style={s.compactRow}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 11.5, color: C.faint }}>
        {mapSegment === "wish" ? `위시리스트 · ${wishes.length}곳` : `${title} · 가게 ${filtered.length} · 기록 ${visitCount}`}
      </Text>
      {chipVisible && mapSegment === "records" && boundsChip(true)}
    </View>
  ) : mapSegment === "wish" ? (
    segmentSwitch
  ) : (
    <View>
      {segmentSwitch}
      <View style={s.headRow}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={s.h}>{title}</Text>
            {dPlus && <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.brick }}>{dPlus}</Text>}
          </View>
          <Text style={s.count}>가게 {filtered.length} · 기록 {visitCount}</Text>
        </View>
        <View style={s.searchIn}>
          <SearchIcon size={14} />
          <BottomSheetTextInput value={q} onChangeText={setQ} placeholder="내 기록에서 찾기" placeholderTextColor="#a8a196" style={{ flex: 1, padding: 0, fontFamily: F.sans, fontSize: 12.5, color: C.ink }} />
        </View>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel="필터"
          style={[s.filterBtn, activeFilters ? { backgroundColor: C.ink, borderWidth: 0 } : null]}
        >
          <FilterLinesIcon stroke={activeFilters ? C.card : C.muted} />
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: activeFilters ? C.card : C.muted }}>{activeFilters ? activeFilters : "필터"}</Text>
        </Pressable>
      </View>

      {chipItems.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingBottom: 10, alignItems: "center" }}>
          {chipItems.map((c) => (
            <Pressable key={c.key} onPress={c.onClear} style={{ borderRadius: 15, backgroundColor: c.key === "bounds" ? C.card : "#f2e0d5", borderWidth: c.key === "bounds" ? 1 : 0, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: c.key === "bounds" ? C.muted : "#a34d27" }}>{c.label} ✕</Text>
            </Pressable>
          ))}
          <Pressable onPress={clearAll}><Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>모두 지우기</Text></Pressable>
        </ScrollView>
      )}

      <View style={s.sortRow}>
        {SORTS.map((o) => (
          <Pressable key={o.value} onPress={() => { Haptics.selectionAsync(); setSort(o.value); }} style={{ paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: sort === o.value ? C.ink : "transparent" }}>
            <Text style={{ fontFamily: sort === o.value ? F.sansMd : F.sans, fontSize: 12.5, color: sort === o.value ? C.ink : "#a8a196" }}>{o.label}</Text>
          </Pressable>
        ))}
        {/* 「현 지도에 있는 기록만」은 정렬과 같은 줄 오른쪽 끝에 둡니다 */}
        {chipVisible && <View style={{ marginLeft: "auto" }}>{boundsChip(false)}</View>}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.map }} onLayout={(e) => { screenH.value = e.nativeEvent.layout.height; setLayoutH(e.nativeEvent.layout.height); }}>
      <PaperMap
        ref={mapRef}
        initialCamera={{ latitude: 37.5605, longitude: 126.982, zoom: 12 }}
        mapPadding={{ top: insets.top + 62, bottom: MAP_PAD_BOTTOM, left: 20, right: 20 }}
        logoAlign="TopLeft"
        logoMargin={{ top: 20, left: 6, right: 0, bottom: 0 }}
        onCameraChanged={(e) => { if (e.reason === "Gesture") setMapMoved(true); }}
        onTapMap={(e) => onMapTap(e.latitude, e.longitude)}
        onCameraIdle={(e) => {
          regionRef.current = { s: e.region.latitude, w: e.region.longitude, n: e.region.latitude + e.region.latitudeDelta, e: e.region.longitude + e.region.longitudeDelta };
          if (e.zoom != null) setZoom(e.zoom);
        }}
      >
        {recordMarkers.map((p) => (
          <RecordMarker
            key={p.key} lat={p.lat as number} lng={p.lng as number} name={p.name} category={p.category} revisit={p.revisit}
            rating={p.rating} active={false} planned={!!matchWish(wishes, p.name)} showLabel={showLabel(`r:${p.key}`)} badge={placeTag(p)}
            onTap={() => { Haptics.selectionAsync(); openPlace(p); }}
          />
        ))}
        {wishMarkers.map((w) => (
          <WishMarker key={w.id} lat={w.lat as number} lng={w.lng as number} name={w.name} category={w.category} showLabel={showLabel(`w:${w.id}`)} onTap={() => { Haptics.selectionAsync(); openWish(w.id); }} />
        ))}
        {ghost && (
          <GhostMarker lat={ghost.lat} lng={ghost.lng} name={ghost.name} onTap={() => newRecord({ name: ghost.name, address: ghost.address, lat: ghost.lat, lng: ghost.lng })} />
        )}
        {/* 지도 탭 — 건물 경계·이름, 둘레 번호 핀, 누른 자리. 시트를 닫으면 함께 사라집니다. */}
        {footprint && placesData?.mode === "building" && (
          <NaverMapPolygonOverlay coords={footprint.coords} color="rgba(180,85,45,0.16)" outlineColor={C.brick} outlineWidth={2} zIndex={1200} />
        )}
        {footprint && placesData?.mode === "building" && (
          <BuildingTagMarker lat={footprint.label.lat} lng={footprint.label.lng} name={placesData.building.name} />
        )}
        {placesData?.mode === "radius" &&
          placesData.places.map((p, i) => <NumberPin key={p.id} n={i + 1} lat={p.lat} lng={p.lng} filled={recordedAt(p)} />)}
        {placesPoint && <TapPointMarker lat={placesPoint.lat} lng={placesPoint.lng} />}
      </PaperMap>

      {/* 위쪽을 눕히는 종이색 그라데이션 — 검색줄 아래에 깝니다 */}
      <Svg pointerEvents="none" width="100%" height={insets.top + 62} style={s.topFade}>
        <Defs>
          <LinearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.paper} stopOpacity={0.96} />
            <Stop offset="1" stopColor={C.paper} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#topFade)" />
      </Svg>

      {/* 검색 행 */}
      <View style={[s.searchRow, { top: insets.top + 8 }]}>
        {/* 기록장 메뉴 — 개인 기록이면 ≡, 연인 기록이면 두 아바타 + 작은 ≡ (§3-1) */}
        <Pressable onPress={() => { Haptics.selectionAsync(); setDrawerOpen(true); }} accessibilityLabel="기록장 메뉴" style={[s.bookBtn, SHADOW.card]}>
          {isCouple ? (
            <>
              <Pair me={meMember} partner={partner} size={30} overlap={9} />
              <View style={s.bookBtnLines}><MenuLines size={10} stroke={C.ink} /></View>
            </>
          ) : (
            <MenuLines />
          )}
        </Pressable>
        <PlaceSearch value={mapQuery} onChange={setMapQuery} onChoose={choosePlace} hasPicked={!!ghost} onClearPicked={() => setState({ ghost: null })} />
        <Pressable onPress={() => router.push("/labels")} accessibilityLabel="라벨첩" style={[s.round, SHADOW.card]}>
          <BurstIcon />
        </Pressable>
      </View>

      {regionView && (
        <View style={[s.regionBand, { top: minTop }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{regionView.name}</Text>
            <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>이 지역 기록 {regionView.count}곳 · 근처 식당을 보여줍니다</Text>
          </View>
          <Pressable onPress={() => setRegionView(null)} accessibilityLabel="지역 띠 닫기" style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15, color: C.faint }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 마커 필터 — 지도 왼쪽 아래, 시트를 따라 오르내립니다 */}
      <Animated.View style={[s.chips, filterStyle]}>
        {FILTERS.map((f) => (
          <Pressable key={f.id} onPress={() => { Haptics.selectionAsync(); setState({ markerFilter: f.id, ...(mapSegment === "wish" && f.id !== "wish" ? { mapSegment: "records" as const } : {}) }); }} style={[s.chip, markerFilter === f.id && { backgroundColor: C.brick }]}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: markerFilter === f.id ? C.card : C.muted }}>{f.label}</Text>
          </Pressable>
        ))}
      </Animated.View>

      {/* 현재 위치 — 웹에는 없지만 앱에서는 보관함 위에 남겨 둡니다 */}
      <Animated.View style={[s.floatRight, locateStyle]}>
        <Pressable onPress={locate} accessibilityLabel="현재 위치" style={[s.round, SHADOW.card]}>
          <LocateIcon size={22} stroke={C.brick} />
        </Pressable>
      </Animated.View>

      {/* 보관함 */}
      <Animated.View style={[s.floatRight, draftsStyle]}>
        <Pressable onPress={() => router.push("/drafts")} accessibilityLabel="보관함" style={[s.drafts, SHADOW_FAB]}>
          <DraftsBoxIcon size={23} />
          {pendingRows.length > 0 && (
            <View style={s.badge}><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.card }}>{pendingRows.length}</Text></View>
          )}
        </Pressable>
      </Animated.View>

      {/* + 단추 — 두 갈래: 기록 추가 / 계획 추가. 메뉴는 위로 펼치고, 바깥을 누르면 닫힙니다 */}
      {plusOpen && <Pressable accessibilityLabel="메뉴 닫기" onPress={() => setPlusOpen(false)} style={StyleSheet.absoluteFill} />}
      {plusOpen && (
        <Animated.View style={[s.plusMenu, plusMenuStyle]}>
          <Pressable onPress={() => { setPlusOpen(false); newRecord({}); }} style={[s.menuBtn, SHADOW_FAB]}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.faint }} />
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>기록 추가</Text>
          </Pressable>
          <Pressable onPress={() => { setPlusOpen(false); router.push("/wish/new"); }} style={[s.menuBtn, SHADOW_FAB]}>
            <BookmarkIcon size={20} />
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>계획 추가</Text>
          </Pressable>
        </Animated.View>
      )}
      <Animated.View style={[s.floatPlus, plusStyle]}>
        <Pressable onPress={() => setPlusOpen((v) => !v)} accessibilityLabel="기록·계획 추가" style={[s.plus, SHADOW_FAB, plusOpen && { backgroundColor: C.brick, borderWidth: 0 }]}>
          <View style={{ transform: [{ rotate: plusOpen ? "45deg" : "0deg" }] }}>
            <PlusIcon stroke={plusOpen ? C.card : C.ink} />
          </View>
        </Pressable>
      </Animated.View>

      <BottomSheet
        ref={sheetRef}
        index={sheetStartIndex}
        snapPoints={sheetSnaps}
        backgroundStyle={[{ backgroundColor: C.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, SHADOW_SHEET]}
        handleIndicatorStyle={{ width: 42, height: 4, borderRadius: 2, backgroundColor: "#cfc8ba" }}
        handleStyle={{ paddingTop: 11, paddingBottom: 9 }}
        animatedPosition={sheetTop}
        onChange={(i) => { sheetIndex.current = i; Haptics.selectionAsync(); }}
      >
        {mapSegment === "wish" ? (
          <BottomSheetFlatList
            data={wishItems}
            keyExtractor={(w: WishItem) => w.key}
            ListHeaderComponent={header}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item }: { item: WishItem }) => <WishRow item={item} />}
          />
        ) : (
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(p: Place) => p.key}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: Place }) => <PlaceCard place={item} onOpen={() => openPlace(item)} couple={coupleInfo(item)} />}
          ListEmptyComponent={
            <Text style={{ paddingHorizontal: 20, paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, lineHeight: 22, color: C.faint }}>
              {"조건에 맞는 기록이 없습니다.\n필터를 지우거나 다른 낱말로 찾아보세요."}
            </Text>
          }
        />
        )}
      </BottomSheet>

      <FilterSheetImpl
        visible={filtersOpen}
        kind={kind}
        onKindChange={(k: Kind) => { setState({ kind: k }); setCategories([]); setKeywords([]); }}
        categories={uniq(inKind.map((r) => r.category))}
        keywords={uniq(inKind.flatMap((r) => r.keywords))}
        selectedCategories={categories}
        selectedKeywords={keywords}
        revisitOnly={revisitOnly}
        verifiedOnly={verifiedOnly}
        count={filtered.length}
        onToggleCategory={(c) => setCategories((l) => (l.includes(c) ? l.filter((v) => v !== c) : [...l, c]))}
        onToggleKeyword={(k) => setKeywords((l) => (l.includes(k) ? l.filter((v) => v !== k) : [...l, k]))}
        onToggleRevisit={() => setRevisitOnly((v) => !v)}
        onToggleVerified={() => setVerifiedOnly((v) => !v)}
        onReset={() => { setCategories([]); setKeywords([]); setRevisitOnly(false); setVerifiedOnly(false); }}
        onClose={() => setFiltersOpen(false)}
      />

      <FoundSheet
        hit={foundHit}
        onClose={() => setFoundHit(null)}
        onRevisit={() => { const r = foundHit!.restaurant; setFoundHit(null); newRecord({ name: r.name, address: r.address ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined, category: r.category ?? undefined, revisit: true }); }}
        onWish={() => { const r = foundHit!.restaurant; setFoundHit(null); openWishPlan({ name: r.name, where_text: r.address ?? r.region ?? undefined, category: r.category ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined }); }}
        onOpen={() => { const h = foundHit!; setFoundHit(null); openPlace(h.place); }}
      />

      <PlacesAtSheet
        state={placesAt.state}
        rows={visibleRows}
        wishes={wishes}
        maxHeight={placesSheetH}
        onClose={placesAt.close}
        onRadius={placesAt.setRadius}
        onRetry={placesAt.retry}
        onPick={pickPlaceAt}
      />

      <SearchMissSheet
        name={ghost?.name ?? null}
        onClose={() => setState({ ghost: null })}
        onAddRecord={() => { const g = ghost!; setState({ ghost: null }); newRecord({ name: g.name, address: g.address, lat: g.lat, lng: g.lng }); }}
        onAddWish={() => { const g = ghost!; setState({ ghost: null }); openWishPlan({ name: g.name, where_text: g.address, lat: g.lat, lng: g.lng }); }}
      />

      {/* 분기가 바뀐 뒤 처음 한 번 — 지난 분기 리캡 안내(개인 기록만) */}
      {!isCouple && <RecapInvite />}

      <BookDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

/** 웹 + 단추 — 획으로 그린 더하기(20, 1.7). */
const PlusIcon = ({ stroke }: { stroke: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

/** 필터 단추의 세 줄. */
const FilterLinesIcon = ({ stroke }: { stroke: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round">
    <Path d="M4 7h16M7 12h10M10 17h4" />
  </Svg>
);

/** 「현 지도에 있는 기록만」 칩의 새로고침 화살표. */
const RefreshIcon = ({ size }: { size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.brick} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <Path d="M20.5 4.5v4.2h-4.2" />
  </Svg>
);

const shadow = (opacity: number, radius: number, y: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({ ios: { shadowColor: C.ink, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y } }, default: { elevation } })!;
/** 웹 0 6px 18px rgba(28,26,23,.16) — 보관함·+·메뉴. */
const SHADOW_FAB = shadow(0.15, 17, 6, 6);
/** 웹 0 -8px 30px rgba(28,26,23,.16) — 시트. */
const SHADOW_SHEET = shadow(0.16, 30, -8, 12);

const s = StyleSheet.create({
  topFade: { position: "absolute", top: 0, left: 0, right: 0 },
  searchRow: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "flex-start", gap: 9, zIndex: 20 },
  bookBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  bookBtnLines: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  chips: {
    position: "absolute", left: 16, flexDirection: "row", padding: 3, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(251,250,246,.95)",
  },
  chip: { height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center" },
  regionBand: {
    position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, borderWidth: 1, borderColor: C.line,
    backgroundColor: "rgba(251,250,246,.96)", paddingHorizontal: 13, paddingVertical: 11,
  },
  floatRight: { position: "absolute", right: 16 },
  floatPlus: { position: "absolute", right: 84 },
  drafts: { width: DRAFTS_H, height: DRAFTS_H, borderRadius: DRAFTS_H / 2, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  plus: { width: PLUS_H, height: PLUS_H, borderRadius: PLUS_H / 2, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  plusMenu: { position: "absolute", right: 16, alignItems: "flex-end", gap: 8 },
  menuBtn: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 16 },
  badge: {
    position: "absolute", top: -3, right: -3, minWidth: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: C.paper,
    backgroundColor: C.brick, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  compactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  h: { fontFamily: F.serif, fontSize: 18, color: C.ink },
  count: { marginTop: 3, fontFamily: F.mono, fontSize: 10.5, color: C.faint },
  filterBtn: { height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5 },
  searchIn: {
    flex: 1, minWidth: 0, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card,
    paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8,
  },
  boundsChip: { minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  sortRow: { flexDirection: "row", alignItems: "center", minHeight: 28, gap: 16, paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#e6e0d3", marginBottom: 12 },
});

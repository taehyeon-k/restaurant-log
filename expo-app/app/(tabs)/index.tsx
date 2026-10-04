import BottomSheet, { BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, BurstIcon, SearchIcon } from "@/components/icons";
import { PaperMap } from "@/components/PaperMap";
import { DraftsBoxIcon } from "@/components/DraftsBoxIcon";
import { useRows, useWishes } from "@/data/queries";
import { setState, useAppState, type MarkerFilter } from "@/data/store";

import { GhostMarker, LABEL_ZOOM, RecordMarker, WishMarker } from "@/features/map/Markers";
import PlaceCard from "@/features/map/PlaceCard";
import PlaceSearch from "@/features/map/PlaceSearch";
import { FilterSheet as FilterSheetImpl, FoundSheet, SearchMissSheet } from "@/features/map/Sheets";
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
  { id: "wish", label: "위시만" },
];

/** 지도 콘텐츠 패딩(아래) — 카메라 중심을 시트 위로 올려둡니다. */
const MAP_PAD_BOTTOM = 320;
const SHEET_SNAPS = ["12%", "46%", "88%"];
const SHEET_START = 1;

type Bounds = { s: number; w: number; n: number; e: number };
type Pt = [number, number];
const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((v): v is string => !!v))];

/** 지도 탭 — 네이버 지도 + 기록 목록 시트. 웹 MobileShell 의 지도 화면 상태를 그대로 옮겼습니다. */
export default function MapTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: allRows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { kind, markerFilter, ghost } = useAppState();

  const mapRef = useRef<NaverMapViewRef>(null);
  const regionRef = useRef<Bounds | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const lastFit = useRef("");
  const holdFit = useRef(false);

  // 네이버 로고는 콘텐츠 패딩 안쪽 귀퉁이에 놓여서, 그대로 두면 바닥에서 MAP_PAD_BOTTOM 만큼 뜬 「왼쪽 중간」에 보입니다.
  // 시트 윗변 바로 위(= 보이는 지도의 왼쪽 아래 귀퉁이)에 붙여, 시트를 끄는 동안에도 같이 오르내리게 합니다. 로고를 가리면 약관 위반입니다.
  const screenH = useSharedValue(0);
  const sheetTop = useSharedValue(0); // 시트 윗변의 y — BottomSheet 가 매 프레임 채웁니다.
  const logoBottom = useDerivedValue(() => (screenH.value && sheetTop.value ? screenH.value - sheetTop.value + 6 - MAP_PAD_BOTTOM : null));

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
  const activeFilters = categories.length + keywords.length + (revisitOnly ? 1 : 0) + (verifiedOnly ? 1 : 0);
  const overlayOpen = filtersOpen || foundHit !== null || ghost !== null || regionView !== null;

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
    sheetRef.current?.snapToIndex(1);
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

  const newRecord = (p: { name?: string; address?: string; lat?: number; lng?: number; category?: string; revisit?: boolean }) =>
    router.push({
      pathname: "/record/edit",
      params: { kind, name: p.name ?? "", address: p.address ?? "", lat: p.lat != null ? String(p.lat) : "", lng: p.lng != null ? String(p.lng) : "", category: p.category ?? "", revisit: p.revisit ? "1" : "" },
    });

  const openWishPlan = (p: { name: string; where_text?: string; category?: string; lat?: number; lng?: number }) => {
    const dup = matchWish(wishes, p.name);
    if (dup) return openWish(dup.id);
    router.push({ pathname: "/wish/new", params: { name: p.name, where_text: p.where_text ?? "", category: p.category ?? "", lat: p.lat != null ? String(p.lat) : "", lng: p.lng != null ? String(p.lng) : "" } });
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

  const showLabel = zoom >= LABEL_ZOOM;
  const recordMarkers = useMemo(() => {
    const placed = (markerFilter === "wish" ? filtered.filter((p) => matchWish(wishes, p.name)) : filtered).filter((p) => p.lat != null && p.lng != null);
    return placed;
  }, [filtered, markerFilter, wishes]);
  const wishMarkers = useMemo(() => {
    if (markerFilter === "visited") return [];
    const names = new Set(filtered.map((p) => norm(p.name)));
    return wishes.filter((w) => w.lat != null && w.lng != null && !names.has(norm(w.name)));
  }, [wishes, filtered, markerFilter]);

  /* ── 시트 ───────────────────────────────────── */

  const chipItems = [
    ...(viewBounds ? [{ key: "bounds", label: "이 지도 범위", onClear: () => setViewBounds(null) }] : []),
    ...categories.map((c) => ({ key: `cat:${c}`, label: c, onClear: () => setCategories((l) => l.filter((v) => v !== c)) })),
    ...keywords.map((k) => ({ key: `kw:${k}`, label: k, onClear: () => setKeywords((l) => l.filter((v) => v !== k)) })),
    ...(revisitOnly ? [{ key: "revisit", label: "재방문", onClear: () => setRevisitOnly(false) }] : []),
    ...(verifiedOnly ? [{ key: "verified", label: "인증된 기록", onClear: () => setVerifiedOnly(false) }] : []),
  ];

  const header = (
    <View style={{ paddingBottom: 6 }}>
      <View style={s.headRow}>
        <Text style={s.h}>{kind === "cafe" ? "카페 기록" : "맛집 기록"}</Text>
        <Text style={s.count}>가게 {filtered.length} · 기록 {visitCount}</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel="필터"
          style={[s.filterBtn, activeFilters ? { backgroundColor: C.ink, borderWidth: 0 } : null]}
        >
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: activeFilters ? C.card : C.muted }}>{activeFilters ? activeFilters : "필터"}</Text>
        </Pressable>
      </View>

      <View style={s.searchIn}>
        <SearchIcon size={14} />
        <BottomSheetTextInput value={q} onChangeText={setQ} placeholder="내 기록에서 찾기" placeholderTextColor="#a8a196" style={{ flex: 1, padding: 0, fontFamily: F.sans, fontSize: 12.5, color: C.ink }} />
      </View>

      {mapMoved && !overlayOpen && (
        <View style={{ alignItems: "flex-end", paddingHorizontal: 20, paddingBottom: 8 }}>
          <Pressable onPress={applyViewBounds} style={s.boundsChip}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>↻ 현 지도에 있는 기록만</Text>
          </Pressable>
        </View>
      )}

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
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.map }} onLayout={(e) => { screenH.value = e.nativeEvent.layout.height; }}>
      <PaperMap
        ref={mapRef}
        initialCamera={{ latitude: 37.5605, longitude: 126.982, zoom: 12 }}
        mapPadding={{ top: insets.top + 130, bottom: MAP_PAD_BOTTOM, left: 20, right: 20 }}
        logoAlign="BottomLeft"
        logoBottom={logoBottom}
        onCameraChanged={(e) => { if (e.reason === "Gesture") setMapMoved(true); }}
        onCameraIdle={(e) => {
          regionRef.current = { s: e.region.latitude, w: e.region.longitude, n: e.region.latitude + e.region.latitudeDelta, e: e.region.longitude + e.region.longitudeDelta };
          if (e.zoom != null) setZoom(e.zoom);
        }}
      >
        {recordMarkers.map((p) => (
          <RecordMarker
            key={p.key} lat={p.lat as number} lng={p.lng as number} name={p.name} category={p.category} revisit={p.revisit}
            rating={p.rating} active={false} planned={!!matchWish(wishes, p.name)} showLabel={showLabel}
            onTap={() => { Haptics.selectionAsync(); openPlace(p); }}
          />
        ))}
        {wishMarkers.map((w) => (
          <WishMarker key={w.id} lat={w.lat as number} lng={w.lng as number} name={w.name} category={w.category} showLabel={showLabel} onTap={() => { Haptics.selectionAsync(); openWish(w.id); }} />
        ))}
        {ghost && (
          <GhostMarker lat={ghost.lat} lng={ghost.lng} name={ghost.name} onTap={() => newRecord({ name: ghost.name, address: ghost.address, lat: ghost.lat, lng: ghost.lng })} />
        )}
      </PaperMap>

      {/* 검색 행 */}
      <View style={[s.searchRow, { top: insets.top + 8 }]}>
        <PlaceSearch value={mapQuery} onChange={setMapQuery} onChoose={choosePlace} hasPicked={!!ghost} onClearPicked={() => setState({ ghost: null })} />
        <Pressable onPress={() => router.push("/labels")} accessibilityLabel="라벨첩" style={[s.round, SHADOW.card]}>
          <BurstIcon />
        </Pressable>
      </View>

      {/* 마커 필터 칩 */}
      <View style={[s.chips, { top: insets.top + 8 + 46 + 12 }]}>
        {FILTERS.map((f) => (
          <Pressable key={f.id} onPress={() => { Haptics.selectionAsync(); setState({ markerFilter: f.id }); }} style={[s.chip, markerFilter === f.id && { backgroundColor: C.brick }]}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: markerFilter === f.id ? C.card : C.muted }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {regionView && (
        <View style={[s.regionBand, { top: insets.top + 8 + 46 + 12 + 40 }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{regionView.name}</Text>
            <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>이 지역 기록 {regionView.count}곳 · 근처 식당을 보여줍니다</Text>
          </View>
          <Pressable onPress={() => setRegionView(null)} accessibilityLabel="지역 띠 닫기" style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15, color: C.faint }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 오른쪽 버튼 열: 현위치 · 기록/계획 추가 · 보관함 */}
      <View style={[s.rightCol, { top: insets.top + 8 + 46 + 12 + 40 + (regionView ? 62 : 0) }]}>
        <Pressable onPress={locate} accessibilityLabel="현재 위치" style={[s.round, SHADOW.card]}>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.6, borderColor: C.brick, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.brick }} />
          </View>
        </Pressable>
        <Pressable onPress={() => setPlusOpen((v) => !v)} accessibilityLabel="기록·계획 추가" style={[s.round, SHADOW.card, plusOpen && { backgroundColor: C.brick, borderColor: C.brick }]}>
          <Text style={{ fontSize: 22, lineHeight: 24, color: plusOpen ? C.card : C.ink, transform: [{ rotate: plusOpen ? "45deg" : "0deg" }] }}>+</Text>
        </Pressable>
        {plusOpen && (
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Pressable onPress={() => { setPlusOpen(false); newRecord({}); }} style={[s.menuBtn, SHADOW.card]}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.faint }} />
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>기록 추가</Text>
            </Pressable>
            <Pressable onPress={() => { setPlusOpen(false); router.push("/wish/new"); }} style={[s.menuBtn, SHADOW.card]}>
              <BookmarkIcon size={20} />
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>계획 추가</Text>
            </Pressable>
          </View>
        )}
        <Pressable onPress={() => router.push("/drafts")} accessibilityLabel="보관함" style={[s.round, SHADOW.card]}>
          <DraftsBoxIcon size={21} />
          {pendingRows.length > 0 && (
            <View style={s.badge}><Text style={{ fontFamily: F.mono, fontSize: 10, color: C.card }}>{pendingRows.length}</Text></View>
          )}
        </Pressable>
      </View>

      <BottomSheet
        ref={sheetRef}
        index={SHEET_START}
        snapPoints={SHEET_SNAPS}
        backgroundStyle={[{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26 }, SHADOW.sheet]}
        handleIndicatorStyle={{ width: 38, height: 4, borderRadius: 2, backgroundColor: "#ded8cb" }}
        handleStyle={{ paddingTop: 10, paddingBottom: 8 }}
        animatedPosition={sheetTop}
        onChange={() => Haptics.selectionAsync()}
      >
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(p: Place) => p.key}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: Place }) => <PlaceCard place={item} onOpen={() => openPlace(item)} />}
          ListEmptyComponent={
            <Text style={{ paddingHorizontal: 20, paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, lineHeight: 22, color: C.faint }}>
              {"조건에 맞는 기록이 없습니다.\n필터를 지우거나 다른 낱말로 찾아보세요."}
            </Text>
          }
        />
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

      <SearchMissSheet
        name={ghost?.name ?? null}
        onClose={() => setState({ ghost: null })}
        onAddRecord={() => { const g = ghost!; setState({ ghost: null }); newRecord({ name: g.name, address: g.address, lat: g.lat, lng: g.lng }); }}
        onAddWish={() => { const g = ghost!; setState({ ghost: null }); openWishPlan({ name: g.name, where_text: g.address, lat: g.lat, lng: g.lng }); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "flex-start", gap: 9, zIndex: 20 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  chips: {
    position: "absolute", left: 16, flexDirection: "row", padding: 3, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(251,250,246,.95)",
  },
  chip: { height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center" },
  regionBand: {
    position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, borderWidth: 1, borderColor: C.line,
    backgroundColor: "rgba(251,250,246,.96)", paddingHorizontal: 13, paddingVertical: 11,
  },
  rightCol: { position: "absolute", right: 16, alignItems: "flex-end", gap: 10 },
  menuBtn: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 16 },
  badge: {
    position: "absolute", top: -3, right: -3, minWidth: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: C.paper,
    backgroundColor: C.brick, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  headRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  h: { fontFamily: F.serif, fontSize: 19, color: C.ink },
  count: { fontFamily: F.mono, fontSize: 11, color: C.faint },
  filterBtn: { height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card, paddingHorizontal: 14, justifyContent: "center", alignSelf: "center" },
  searchIn: {
    marginHorizontal: 20, marginBottom: 10, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.paper,
    paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8,
  },
  boundsChip: { minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 10, justifyContent: "center" },
  sortRow: { flexDirection: "row", gap: 16, paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#e6e0d3", marginBottom: 12 },
});

/**
 * 지도 탭(§4.1) — 내 기록과 위시를 지도 위에서 보고, 아래 시트에서 목록으로 훑습니다.
 * 웹 `MobileShell.tsx` 의 지도 부분을 라우트 하나로 폈습니다. 화면 상태기(placeKey,
 * visitId, editing, flow…)는 전부 라우트로 흩어졌습니다.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Animated, { useAnimatedStyle, type SharedValue, useSharedValue } from "react-native-reanimated";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import NaverMap, { type MapHandle, type MarkerFilter, type ViewBounds } from "@/components/NaverMap";
import PlaceCard from "@/components/PlaceCard";
import PlaceSearchBar, { type PickedPlace } from "@/components/PlaceSearchBar";
import FilterSheet from "@/components/FilterSheet";
import FoundHitSheet from "@/components/FoundHitSheet";
import SearchMissSheet from "@/components/SearchMissSheet";
import WishSheet from "@/components/WishSheet";
import {
  BookmarkIcon,
  Burst,
  DraftsBoxIcon,
  FilterIcon,
  LocateIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui";
import { groupPlaces, type Place } from "@/lib/places";
import { matchWish, type Kind, type Restaurant, type Sort, type Wish } from "@/lib/types";
import type { Place as GeocodePlace } from "@/lib/geocode";
import {
  inRegion,
  inSearchedRegion,
  matchRegionName,
  regionFromSearch,
  regionNamesFrom,
} from "@/lib/regions";
import { useRefresh, useRestaurants, useWishes } from "@/lib/data";
import { C, FONT, R, SHADOW, TAB_BAR_HEIGHT } from "@/lib/theme";
import { TextInput } from "react-native";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "최근순" },
  { value: "rating", label: "별점순" },
  { value: "price", label: "가격순" },
];

const MARKER_FILTERS: { id: MarkerFilter; label: string }[] = [
  { id: "all", label: "둘 다" },
  { id: "visited", label: "기록만" },
  { id: "wish", label: "위시리스트만" },
];

/**
 * 이미 기록한 가게인지 — 이름이 정확히 같거나, 아주 가까우면(30m) 같은 곳으로 봅니다.
 * 부분일치로 보거나 반경을 넓히면 "자마버거"가 "자마버거 이대점"과 "자마버거 망원점"을
 * 구분 못 하거나, 옆 건물의 다른 가게와 헷갈립니다.
 */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const SAME_SPOT_M = 30;

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

const uniq = (list: (string | null | undefined)[]) => [
  ...new Set(list.filter((v): v is string => !!v)),
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();

  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const [kind, setKind] = useState<Kind>("restaurant");
  const [sort, setSort] = useState<Sort>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [pickedPlace, setPickedPlace] = useState<PickedPlace>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** 「현 지도에 있는 기록만」 — 지도를 옮겼는지, 걸어 둔 범위. */
  const [mapMoved, setMapMoved] = useState(false);
  const [viewBounds, setViewBounds] = useState<ViewBounds | null>(null);

  const [markerFilter, setMarkerFilter] = useState<MarkerFilter>("all");
  const [plusOpen, setPlusOpen] = useState(false);
  const [openWishId, setOpenWishId] = useState<string | null>(null);
  /** 지도 검색에서 이미 있는 가게를 찾았을 때의 작은 시트. */
  const [foundHit, setFoundHit] = useState<{ restaurant: Restaurant; place: Place } | null>(null);
  /** 지도 검색이 지역으로 걸렸을 때 — 기록 추가 시트 대신 이 지역 띠를 띄웁니다. */
  const [regionView, setRegionView] = useState<{ name: string; count: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const mapRef = useRef<MapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const sheetPosition = useSharedValue(0);

  /* ── 데이터 ────────────────────────────────────── */

  /** 작성 전(pending) 기록 — 보관함에만 보이고, 목록·지도·필터에는 넘기지 않습니다. */
  const pendingRows = useMemo(() => rows.filter((r) => r.pending), [rows]);
  const visibleRows = useMemo(() => rows.filter((r) => !r.pending), [rows]);

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
      .filter(
        (p) =>
          !viewBounds ||
          (p.lat != null &&
            p.lng != null &&
            p.lat >= viewBounds.s &&
            p.lat <= viewBounds.n &&
            p.lng >= viewBounds.w &&
            p.lng <= viewBounds.e)
      )
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

  const filteredVisitCount = useMemo(
    () => filtered.reduce((sum, p) => sum + p.visits.length, 0),
    [filtered]
  );

  const activeFilters =
    categories.length + keywords.length + (revisitOnly ? 1 : 0) + (verifiedOnly ? 1 : 0);

  const overlayOpen =
    filtersOpen || openWishId !== null || foundHit !== null || pickedPlace !== null || regionView !== null;

  const mapChipVisible = mapMoved && !overlayOpen;

  /* ── 열기 ─────────────────────────────────────── */

  const openPlace = useCallback(
    (key: string, k: Kind = kind) => {
      const target = placesByKind[k].find((p) => p.key === key);
      if (!target) return;

      setRegionView(null);
      setKind(k);
      setSelectedKey(key);

      // 기록이 하나뿐인 가게는 가게 화면을 건너뛰고 그 기록으로 바로 들어갑니다.
      if (target.visits.length === 1) router.push(`/record/${target.visits[0].id}`);
      else router.push({ pathname: "/place/[key]", params: { key, kind: k } });
    },
    [kind, placesByKind, router]
  );

  const applyViewBounds = useCallback(() => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;
    // 목록만 지금 보이는 범위로 줄입니다 — 지도는 사용자가 원하는 자리에 그대로 둡니다.
    mapRef.current?.holdFit();
    setViewBounds(bounds);
    setMapMoved(false);
    sheetRef.current?.snapToIndex(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setCategories([]);
    setKeywords([]);
    setRevisitOnly(false);
    setVerifiedOnly(false);
    setViewBounds(null);
  }, []);

  const locateMe = useCallback(async () => {
    void Haptics.selectionAsync();
    const granted = await Location.requestForegroundPermissionsAsync();
    if (!granted.granted) return;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.flyTo(p.coords.latitude, p.coords.longitude, 16);
  }, []);

  /* ── 지도 검색 ─────────────────────────────────── */

  function findRecord(p: GeocodePlace): Restaurant | null {
    const needle = norm(p.name || "");

    if (needle) {
      const byName = visibleRows.find((r) => norm(r.name) === needle);
      if (byName) return byName;
    }

    return (
      visibleRows.find(
        (r) => r.lat !== null && r.lng !== null && metersBetween(r.lat, r.lng, p.lat, p.lng) < SAME_SPOT_M
      ) ?? null
    );
  }

  /** 이미 담아둔 위시인지 — 담아둔 곳을 검색했는데 "어느 쪽에도 없다"고 말하면 안 됩니다. */
  function findWish(p: GeocodePlace): Wish | null {
    const needle = norm(p.name || "");

    if (needle) {
      const byName = wishes.find((w) => norm(w.name) === needle);
      if (byName) return byName;
    }

    return (
      wishes.find(
        (w) => w.lat !== null && w.lng !== null && metersBetween(w.lat, w.lng, p.lat, p.lng) < SAME_SPOT_M
      ) ?? null
    );
  }

  function enterRegionView(
    name: string,
    rowsInRegion: Restaurant[],
    fallbackCenter?: { lat: number; lng: number }
  ) {
    setFoundHit(null);
    setOpenWishId(null);
    setFiltersOpen(false);
    setPlusOpen(false);
    setPickedPlace(null);
    setMapQuery("");
    setQ("");
    clearAllFilters();
    setMapMoved(false);
    setRegionView({ name, count: rowsInRegion.length });

    const points = rowsInRegion
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => [r.lat as number, r.lng as number] as [number, number]);

    if (points.length) mapRef.current?.fitRegion(points);
    else if (fallbackCenter) mapRef.current?.flyTo(fallbackCenter.lat, fallbackCenter.lng, 13);
  }

  function handleChoosePlace(p: GeocodePlace) {
    setRegionView(null);
    const hit = findRecord(p);

    if (hit) {
      setPickedPlace(null);
      const target = placesByKind[hit.kind].find((pl) => pl.visits.some((v) => v.id === hit.id));
      if (target) {
        if (target.lat != null && target.lng != null) mapRef.current?.flyTo(target.lat, target.lng, 16);
        // 곧바로 들어가지 않고 작은 시트로 먼저 보여줍니다.
        setFoundHit({ restaurant: hit, place: target });
      }
      return;
    }

    const wishHit = findWish(p);
    if (wishHit) {
      setPickedPlace(null);
      if (wishHit.lat != null && wishHit.lng != null) mapRef.current?.flyTo(wishHit.lat, wishHit.lng, 16);
      else mapRef.current?.flyTo(p.lat, p.lng, 16);
      setOpenWishId(wishHit.id);
      return;
    }

    // 가게·위시 어디에도 없으면 지역인지 봅니다 — "중구식당" 같은 가게 이름이 지역으로
    // 빨려 들어가지 않게, 이 확인은 반드시 위 두 검사 다음입니다.
    const regionName = matchRegionName(p.name || p.address, regionNames);
    if (regionName) {
      enterRegionView(regionName, visibleRows.filter((r) => inRegion(r, regionName)), { lat: p.lat, lng: p.lng });
      return;
    }

    if (!p.name) {
      const searched = regionFromSearch(p.address);
      if (searched) {
        enterRegionView(
          searched.label,
          visibleRows.filter((r) => inSearchedRegion(r, searched)),
          { lat: p.lat, lng: p.lng }
        );
        return;
      }
    }

    setPickedPlace({ name: p.name || p.address, address: p.address, lat: p.lat, lng: p.lng });
    mapRef.current?.flyTo(p.lat, p.lng, 16);
  }

  /**
   * 예정으로 담습니다 — 이미 같은 이름의 위시가 있으면 새로 만들지 않고 그 위시
   * 시트를 곧바로 엽니다(중복 방지, WISH MET 유령 위시를 막습니다).
   */
  const openWishPlan = useCallback(
    (preset: { name: string; where_text?: string; category?: string; lat?: number; lng?: number }) => {
      const dup = matchWish(wishes, preset.name);
      if (dup) {
        setOpenWishId(dup.id);
        return;
      }
      router.push({
        pathname: "/wish/new",
        params: {
          name: preset.name,
          where_text: preset.where_text ?? "",
          category: preset.category ?? "",
          lat: preset.lat != null ? String(preset.lat) : "",
          lng: preset.lng != null ? String(preset.lng) : "",
        },
      });
    },
    [wishes, router]
  );

  const openWish = openWishId ? wishes.find((w) => w.id === openWishId) ?? null : null;

  /* ── 떠 있는 단추 — 시트를 따라 올라갑니다 ────────── */

  const floatingStyle = useFloatAboveSheet(sheetPosition, 14);
  const bottomInset = TAB_BAR_HEIGHT + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: C.map }}>
      <NaverMap
        ref={mapRef}
        places={filtered}
        selectedKey={selectedKey}
        onSelect={(key) => openPlace(key)}
        frozen={overlayOpen}
        ghost={pickedPlace}
        onGhostPress={() =>
          pickedPlace &&
          router.push({
            pathname: "/record/new",
            params: {
              kind,
              name: pickedPlace.name,
              address: pickedPlace.address,
              lat: String(pickedPlace.lat),
              lng: String(pickedPlace.lng),
            },
          })
        }
        wishes={wishes}
        markerFilter={markerFilter}
        onSelectWish={(id) => setOpenWishId(id)}
        onMapMoved={() => setMapMoved(true)}
      />

      {/* 위쪽을 눕히는 종이색 그라데이션 자리 — RN 에는 그라디언트가 없어 단색 띠로 둡니다. */}

      {/* 2. 검색 행 */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 9,
        }}
      >
        <PlaceSearchBar
          value={mapQuery}
          onChange={setMapQuery}
          onChoose={handleChoosePlace}
          picked={pickedPlace}
          onClearPicked={() => setPickedPlace(null)}
        />

        <Pressable
          onPress={() => router.push("/labels")}
          accessibilityLabel="라벨첩"
          style={[
            {
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: C.line,
              backgroundColor: C.card,
            },
            SHADOW.card,
          ]}
        >
          <Burst size={18} />
        </Pressable>
      </View>

      {/* 3. 마커 필터 칩 */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 8 + 46 + 12,
          left: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: "rgba(251,250,246,.95)",
          padding: 3,
        }}
      >
        {MARKER_FILTERS.map((f) => {
          const on = markerFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => {
                void Haptics.selectionAsync();
                setMarkerFilter(f.id);
              }}
              style={{
                height: 30,
                borderRadius: 15,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? C.brick : "transparent",
              }}
            >
              <Text style={{ fontSize: 11.5, color: on ? C.card : C.muted, fontFamily: FONT.sans }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 4. 현위치 버튼 */}
      <Pressable
        onPress={locateMe}
        accessibilityLabel="현위치"
        style={[
          {
            position: "absolute",
            right: 16,
            top: insets.top + 8 + 46 + 12,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.card,
          },
          SHADOW.card,
        ]}
      >
        <LocateIcon />
      </Pressable>

      {/* 지역 띠 — 지역을 검색했을 때 기록 추가 시트 대신 뜹니다. */}
      {regionView && (
        <View
          style={[
            {
              position: "absolute",
              top: insets.top + 8 + 46 + 12 + 42,
              left: 16,
              right: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: C.line,
              backgroundColor: "rgba(251,250,246,.96)",
              paddingHorizontal: 13,
              paddingVertical: 11,
            },
            SHADOW.card,
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 14, color: C.ink }}>
              {regionView.name}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>
              이 지역 기록 {regionView.count}곳 · 근처 식당을 보여줍니다
            </Text>
          </View>
          <Pressable onPress={() => setRegionView(null)} hitSlop={8} accessibilityLabel="지역 띠 닫기">
            <Text style={{ fontSize: 15, color: C.faint }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 보관함 · + 단추 — 시트 위에 얹혀 함께 움직입니다. */}
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: "absolute", left: 0, right: 0 }, floatingStyle]}
      >
        <View style={{ position: "absolute", right: 16, bottom: 0, alignItems: "flex-end", gap: 10 }}>
          {plusOpen && (
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <PlusMenuItem
                label="기록 추가"
                icon={<View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.faint }} />}
                onPress={() => {
                  setPlusOpen(false);
                  router.push({ pathname: "/record/new", params: { kind } });
                }}
              />
              <PlusMenuItem
                label="계획 추가"
                icon={<BookmarkIcon size={20} stroke={C.ink} />}
                onPress={() => {
                  setPlusOpen(false);
                  router.push("/wish/new");
                }}
              />
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={() => setPlusOpen((v) => !v)}
              accessibilityLabel="기록·계획 추가"
              style={[
                {
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: plusOpen ? C.brick : C.card,
                  borderWidth: plusOpen ? 0 : 1,
                  borderColor: C.line,
                },
                plusOpen ? SHADOW.shutter : SHADOW.card,
              ]}
            >
              <PlusIcon stroke={plusOpen ? C.card : C.ink} />
            </Pressable>

            <Pressable
              onPress={() => router.push("/drafts")}
              accessibilityLabel="보관함"
              style={[
                {
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: C.line,
                },
                SHADOW.card,
              ]}
            >
              <DraftsBoxIcon />
              {pendingRows.length > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -3,
                    minWidth: 21,
                    height: 21,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: C.paper,
                    backgroundColor: C.brick,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 5,
                  }}
                >
                  <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.card }}>
                    {pendingRows.length}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* 5. 바텀시트 */}
      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={["12%", "46%", "88%"]}
        bottomInset={bottomInset}
        animatedPosition={sheetPosition}
        enablePanDownToClose={false}
        backgroundStyle={{
          backgroundColor: C.card,
          borderTopLeftRadius: R.sheet,
          borderTopRightRadius: R.sheet,
        }}
        style={SHADOW.sheet}
        handleIndicatorStyle={{ width: 38, height: 4, borderRadius: 2, backgroundColor: "#ded8cb" }}
      >
        <View style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontFamily: FONT.serifBold, fontSize: 19, color: C.ink }}>이 지역의 기록</Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>
              가게 {filtered.length} · 기록 {filteredVisitCount}
            </Text>

            <View style={{ flex: 1 }} />

            <Pressable onPress={() => setSortOpen((v) => !v)} hitSlop={8}>
              <Text style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT.sans }}>
                {SORTS.find((s) => s.value === sort)?.label} ▾
              </Text>
            </Pressable>
          </View>

          {sortOpen && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {SORTS.map((s) => (
                <Pressable
                  key={s.value}
                  onPress={() => {
                    setSort(s.value);
                    setSortOpen(false);
                  }}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: sort === s.value ? C.brick : C.hairline,
                    backgroundColor: sort === s.value ? C.brickSoft : "transparent",
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 11.5, color: sort === s.value ? C.brick : C.muted, fontFamily: FONT.sans }}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/*
            내 기록에서 찾기 + 필터 — §4.1 의 헤더 명세에는 없지만, 웹에 있던
            기능이라 그대로 살립니다. 없애면 낱말·카테고리·인증 필터로 들어갈 길이
            사라집니다.
          */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <View
              style={{
                flex: 1,
                height: 40,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: C.hairline,
                backgroundColor: C.paper,
                paddingHorizontal: 12,
              }}
            >
              <SearchIcon size={14} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="내 기록에서 찾기"
                placeholderTextColor="#a8a196"
                style={{ flex: 1, fontSize: 12.5, color: C.ink, fontFamily: FONT.sans, padding: 0 }}
              />
            </View>

            <Pressable
              onPress={() => setFiltersOpen(true)}
              accessibilityLabel="필터"
              style={{
                height: 40,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 20,
                paddingHorizontal: 12,
                borderWidth: activeFilters ? 0 : 1,
                borderColor: C.hairline,
                backgroundColor: activeFilters ? C.ink : C.paper,
              }}
            >
              <FilterIcon stroke={activeFilters ? C.card : C.muted} />
              <Text style={{ fontSize: 12.5, color: activeFilters ? C.card : C.muted, fontFamily: FONT.sans }}>
                {activeFilters ? String(activeFilters) : "필터"}
              </Text>
            </Pressable>
          </View>

          {mapChipVisible && (
            <Pressable
              onPress={applyViewBounds}
              style={{
                marginTop: 8,
                alignSelf: "flex-end",
                minHeight: 28,
                justifyContent: "center",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#e0c3b1",
                backgroundColor: "#f9f0e9",
                paddingHorizontal: 10,
              }}
            >
              <Text style={{ fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>현 지도에 있는 기록만</Text>
            </Pressable>
          )}

          {viewBounds && (
            <Pressable
              onPress={() => setViewBounds(null)}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                borderRadius: 15,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.paper,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>이 지도 범위 ✕</Text>
            </Pressable>
          )}
        </View>

        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(p) => p.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 10 }}
          renderItem={({ item }) => <PlaceCard place={item} onPress={() => openPlace(item.key)} />}
          ListEmptyComponent={
            <Text
              style={{
                paddingHorizontal: 20,
                paddingVertical: 44,
                textAlign: "center",
                fontSize: 12.5,
                lineHeight: 22,
                color: C.faint,
                fontFamily: FONT.sans,
              }}
            >
              조건에 맞는 기록이 없습니다.{"\n"}필터를 지우거나 다른 낱말로 찾아보세요.
            </Text>
          }
        />
      </BottomSheet>

      {filtersOpen && (
        <FilterSheet
          kind={kind}
          onKindChange={(k) => {
            setKind(k);
            setCategories([]);
            setKeywords([]);
          }}
          categories={uniq(inKind.map((r) => r.category))}
          keywords={uniq(inKind.flatMap((r) => r.keywords))}
          selectedCategories={categories}
          selectedKeywords={keywords}
          revisitOnly={revisitOnly}
          verifiedOnly={verifiedOnly}
          count={filtered.length}
          onToggleCategory={(c) =>
            setCategories((p) => (p.includes(c) ? p.filter((v) => v !== c) : [...p, c]))
          }
          onToggleKeyword={(k) =>
            setKeywords((p) => (p.includes(k) ? p.filter((v) => v !== k) : [...p, k]))
          }
          onToggleRevisit={() => setRevisitOnly((v) => !v)}
          onToggleVerified={() => setVerifiedOnly((v) => !v)}
          onReset={clearAllFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {foundHit && (
        <FoundHitSheet
          restaurant={foundHit.restaurant}
          place={foundHit.place}
          bottomInset={bottomInset}
          onClose={() => setFoundHit(null)}
          onRevisit={() => {
            const s = foundHit.restaurant;
            setFoundHit(null);
            router.push({
              pathname: "/record/new",
              params: {
                kind: s.kind,
                name: s.name,
                address: s.address ?? "",
                lat: s.lat != null ? String(s.lat) : "",
                lng: s.lng != null ? String(s.lng) : "",
                category: s.category ?? "",
                revisit: "1",
              },
            });
          }}
          onAddWish={() => {
            const s = foundHit.restaurant;
            setFoundHit(null);
            openWishPlan({
              name: s.name,
              where_text: s.address ?? s.region ?? undefined,
              category: s.category ?? undefined,
              lat: s.lat ?? undefined,
              lng: s.lng ?? undefined,
            });
          }}
          onOpenPlace={() => {
            const target = foundHit.place;
            const k = foundHit.restaurant.kind;
            setFoundHit(null);
            openPlace(target.key, k);
          }}
        />
      )}

      {pickedPlace && (
        <SearchMissSheet
          name={pickedPlace.name}
          bottomInset={bottomInset}
          onAddRecord={() => {
            const p = pickedPlace;
            setPickedPlace(null);
            router.push({
              pathname: "/record/new",
              params: {
                kind,
                name: p.name,
                address: p.address,
                lat: String(p.lat),
                lng: String(p.lng),
              },
            });
          }}
          onAddWish={() => {
            const p = pickedPlace;
            setPickedPlace(null);
            openWishPlan({ name: p.name, where_text: p.address ?? undefined, lat: p.lat, lng: p.lng });
          }}
          onClose={() => setPickedPlace(null)}
        />
      )}

      {openWish && (
        <WishSheet
          wish={openWish}
          bottomInset={bottomInset}
          onClose={() => setOpenWishId(null)}
          onCaptureHere={() => {
            setOpenWishId(null);
            router.push({ pathname: "/capture", params: { verifyWishId: openWish.id } });
          }}
          onViewList={() => {
            setOpenWishId(null);
            router.push("/wish");
          }}
          onChanged={refresh}
          onDeleted={() => {
            setOpenWishId(null);
            refresh();
          }}
        />
      )}
    </View>
  );
}

/** 시트 꼭대기보다 `gap` 만큼 위에 떠 있게 합니다 — 시트를 끌면 함께 올라갑니다. */
function useFloatAboveSheet(position: SharedValue<number>, gap: number) {
  return useAnimatedStyle(() => ({
    transform: [{ translateY: position.value - gap }],
    top: 0,
    height: 0,
  }));
}

function PlusMenuItem({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 46,
          borderRadius: 16,
          backgroundColor: C.card,
          paddingHorizontal: 16,
        },
        SHADOW.card,
      ]}
    >
      {icon}
      <Text style={{ fontSize: 13, color: C.ink, fontFamily: FONT.sans }}>{label}</Text>
    </Pressable>
  );
}

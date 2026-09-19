/**
 * 지도(§4.1) — 웹 `MobileMap.tsx` 의 HTML 마커를 react-native-svg 로 다시 그린 것입니다.
 *
 * 핀 모양: 웹은 `border-radius: 50% 50% 50% 0` + `rotate(-45deg)` 였습니다. RN 에는
 * 모서리별 타원 반지름이 없어 재현이 어렵습니다 — SVG path 한 장으로 그립니다.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import {
  NaverMapMarkerOverlay,
  NaverMapView,
  type NaverMapViewRef,
  type Region,
} from "@mj-studio/react-native-naver-map";
import * as Haptics from "expo-haptics";

import type { Place } from "@/lib/places";
import { matchWish, pinColor, type Wish } from "@/lib/types";
import { BOOKMARK_PATH } from "@/components/ui";
import { C, FONT, SHADOW } from "@/lib/theme";

export type MarkerFilter = "all" | "visited" | "wish";
export type ViewBounds = { s: number; w: number; n: number; e: number };
export type Ghost = { name: string; lat: number; lng: number } | null;

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitTo: (points: [number, number][]) => void;
  /** 지역 보기 — 한 점으로는 파고들지 않게 줌을 14 로 묶습니다. */
  fitRegion: (points: [number, number][]) => void;
  getBounds: () => ViewBounds | null;
  /** 다음 목록 변화 한 번은 범위 맞추기를 건너뜁니다. */
  holdFit: () => void;
};

export type Placed = Place & { lat: number; lng: number };
export const placed = (places: Place[]) =>
  places.filter((p): p is Placed => p.lat !== null && p.lng !== null);

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 이 줌보다 멀면 이름표를 감춥니다 — 웹 `LABEL_ZOOM` 과 같은 값. */
const LABEL_ZOOM = 15;
const SEOUL = { latitude: 37.5605, longitude: 126.982 };

/* ── 마커 ──────────────────────────────────────── */

/** 기록 핀 — 물방울 + 가운데 점 + 바닥 그림자. */
function RecordPin({ category, revisit, active }: { category: string | null; revisit: boolean; active: boolean }) {
  const base = pinColor(category);
  const fill = revisit ? base : C.card;
  const stroke = revisit ? C.card : base;
  const core = revisit ? C.card : base;
  const size = active ? 30 : 23;

  return (
    <Svg width={size + 8} height={size + 10} viewBox="0 0 32 38">
      <Ellipse cx="16" cy="35.5" rx="4.5" ry="1.5" fill="rgba(28,26,23,.16)" />
      <Path
        d="M16 33 L4.6 18.6 A12 12 0 1 1 27.4 18.6 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={active ? 2 : 1.5}
        strokeLinejoin="round"
      />
      <Circle cx="16" cy="13.5" r={active ? 5 : 4} fill={core} />
    </Svg>
  );
}

/** 위시 마커 — 책갈피. 기록 핀과 모양으로 갈립니다. */
function WishPin({ category }: { category: string | null }) {
  return (
    <Svg width={26} height={30} viewBox="0 0 24 28">
      <Ellipse cx="12" cy="26" rx="4" ry="1.3" fill="rgba(28,26,23,.16)" />
      <Path d={BOOKMARK_PATH} fill={pinColor(category)} stroke={C.card} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

/** 아직 기록에 없는 자리 — 점선 물방울. */
function GhostPin() {
  return (
    <Svg width={30} height={36} viewBox="0 0 32 38">
      <Ellipse cx="16" cy="35.5" rx="4.5" ry="1.5" fill="rgba(28,26,23,.1)" />
      <Path
        d="M16 33 L4.6 18.6 A12 12 0 1 1 27.4 18.6 Z"
        fill="rgba(138,131,119,.15)"
        stroke={C.faint}
        strokeWidth={1.5}
        strokeDasharray="3 2.5"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * 기록이 있는 곳을 또 갈 예정으로 담았을 때 붙는 책갈피 배지.
 * 한 자리에 핀 하나 — 물방울 오른쪽 위 모서리에 얹습니다.
 */
function PlannedBadge() {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 15,
        height: 15,
        borderRadius: 7.5,
        backgroundColor: C.card,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: C.ink,
        shadowOpacity: 0.28,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      }}
    >
      <Svg width={9} height={9} viewBox="0 0 24 24">
        <Path d={BOOKMARK_PATH} fill={C.brick} />
      </Svg>
    </View>
  );
}

/** 이름표 — 웹 `.restaurant-map-tooltip` 과 같은 종이 판. radius 14 14 14 3. */
function Label({ name, rating, cta }: { name: string; rating?: number | null; cta?: string }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: C.line,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomRightRadius: 14,
          borderBottomLeftRadius: 3,
          backgroundColor: C.card,
          paddingTop: 7,
          paddingBottom: 6,
          paddingHorizontal: 12,
          marginBottom: 2,
        },
        SHADOW.card,
      ]}
    >
      <Text style={{ fontSize: 13, lineHeight: 16, color: C.ink, fontFamily: FONT.sansMedium }} numberOfLines={1}>
        {name}
      </Text>
      {rating !== undefined && (
        <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>
          ★ {rating == null ? "—" : rating.toFixed(1)}
        </Text>
      )}
      {cta != null && <Text style={{ fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>{cta}</Text>}
    </View>
  );
}

/* ── 지도 ──────────────────────────────────────── */

type Props = {
  places: Place[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** 다른 시트가 떠 있으면 카메라를 건드리지 않습니다. */
  frozen: boolean;
  ghost?: Ghost;
  onGhostPress?: () => void;
  wishes?: Wish[];
  markerFilter?: MarkerFilter;
  onSelectWish?: (id: string) => void;
  /** 사용자가 손으로 지도를 옮겼을 때만 부릅니다. */
  onMapMoved?: () => void;
};

const NaverMap = forwardRef<MapHandle, Props>(function NaverMap(
  {
    places,
    selectedKey,
    onSelect,
    frozen,
    ghost = null,
    onGhostPress,
    wishes = [],
    markerFilter = "all",
    onSelectWish,
    onMapMoved,
  },
  ref
) {
  const mapRef = useRef<NaverMapViewRef>(null);
  const boundsRef = useRef<ViewBounds | null>(null);
  const holdFitRef = useRef(false);
  /**
   * 코드가 카메라를 움직였을 때의 idle 한 번은 흘려보냅니다 — 손으로 옮긴 것만
   * 「현 지도에 있는 기록만」 칩을 띄워야 합니다. 첫 idle 도 사용자가 손댄 게 아닙니다.
   */
  const suppressMoveRef = useRef(true);
  const lastFit = useRef("");
  const [zoom, setZoom] = useState(12);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lng, z = 15) => {
        lastFit.current = `fly:${lat},${lng}`;
        suppressMoveRef.current = true;
        mapRef.current?.animateCameraTo({ latitude: lat, longitude: lng, zoom: z, duration: 700 });
      },
      fitTo: (points) => fit(points, 15),
      fitRegion: (points) => fit(points, 14),
      getBounds: () => boundsRef.current,
      holdFit: () => {
        holdFitRef.current = true;
      },
    }),
    []
  );

  function fit(points: [number, number][], maxZoom: number) {
    if (!points.length) return;
    suppressMoveRef.current = true;

    if (points.length === 1) {
      mapRef.current?.animateCameraTo({
        latitude: points[0][0],
        longitude: points[0][1],
        zoom: maxZoom,
        duration: 600,
      });
      return;
    }

    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: { latitude: Math.min(...lats), longitude: Math.min(...lngs) },
      coord2: { latitude: Math.max(...lats), longitude: Math.max(...lngs) },
      duration: 600,
    });
  }

  /**
   * 「가고싶다만」에서도 기록+위시가 겹치는 곳은 배지 붙은 물방울로 남깁니다 — 그렇지
   * 않으면 위시 마커가 걸러지고 기록 핀도 숨어 그 자리가 통째로 사라집니다.
   */
  const visiblePlaces = useMemo(() => {
    const all = placed(places);
    return markerFilter === "wish" ? all.filter((p) => matchWish(wishes, p.name) != null) : all;
  }, [places, wishes, markerFilter]);

  /** 기록이 있는 곳은 배지로 이미 드러나므로, 이름이 같은 위시는 겹치지 않게 걸러냅니다. */
  const visibleWishes = useMemo(() => {
    if (markerFilter === "visited") return [];
    const recordNames = new Set(places.map((p) => norm(p.name)));
    return wishes.filter(
      (w): w is Wish & { lat: number; lng: number } =>
        w.lat != null && w.lng != null && !recordNames.has(norm(w.name))
    );
  }, [wishes, places, markerFilter]);

  // 목록(검색·필터)이 바뀌면 그 점들에 맞춰 카메라를 옮깁니다. 마커 필터를 눌렀다고
  // 지도가 튀면 안 되므로 기준은 언제나 `places` 전체입니다.
  const allPlaced = placed(places);
  const fitKey = allPlaced.map((p) => p.key).join(",");
  if (fitKey && fitKey !== lastFit.current) {
    lastFit.current = fitKey;
    if (frozen || holdFitRef.current) {
      holdFitRef.current = false;
    } else {
      // 렌더 중에 명령하지 않고 다음 틱으로 미룹니다.
      setTimeout(() => fit(allPlaced.map((p) => [p.lat, p.lng]), 15), 0);
    }
  }

  const showLabels = zoom >= LABEL_ZOOM;

  const onIdle = (params: { zoom?: number; region: Region }) => {
    const r = params.region;
    boundsRef.current = {
      s: r.latitude,
      w: r.longitude,
      n: r.latitude + r.latitudeDelta,
      e: r.longitude + r.longitudeDelta,
    };
    if (params.zoom != null) setZoom(params.zoom);

    if (suppressMoveRef.current) {
      suppressMoveRef.current = false;
      return;
    }
    onMapMoved?.();
  };

  const tap = (fn: () => void) => () => {
    void Haptics.selectionAsync();
    fn();
  };

  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
      <NaverMapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialCamera={{ ...SEOUL, zoom: 12 }}
        isShowZoomControls={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        onCameraIdle={onIdle}
        onInitialized={() => {
          suppressMoveRef.current = true;
        }}
      >
        {visiblePlaces.map((p) => {
          const active = selectedKey === p.key;
          const planned = matchWish(wishes, p.name) != null;

          return (
            <NaverMapMarkerOverlay
              key={p.key}
              latitude={p.lat}
              longitude={p.lng}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={active ? 1000 : 0}
              onTap={tap(() => onSelect(p.key))}
              width={140}
              height={showLabels ? 96 : 42}
            >
              <View style={{ alignItems: "center" }}>
                {showLabels && <Label name={p.name} rating={p.rating} />}
                <View>
                  <RecordPin category={p.category} revisit={p.revisit} active={active} />
                  {planned && <PlannedBadge />}
                </View>
              </View>
            </NaverMapMarkerOverlay>
          );
        })}

        {visibleWishes.map((w) => (
          <NaverMapMarkerOverlay
            key={w.id}
            latitude={w.lat}
            longitude={w.lng}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={500}
            onTap={tap(() => onSelectWish?.(w.id))}
            width={140}
            height={showLabels ? 92 : 36}
          >
            <View style={{ alignItems: "center" }}>
              {showLabels && <Label name={w.name} />}
              <WishPin category={w.category} />
            </View>
          </NaverMapMarkerOverlay>
        ))}

        {ghost && (
          <NaverMapMarkerOverlay
            latitude={ghost.lat}
            longitude={ghost.lng}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={1200}
            onTap={tap(() => onGhostPress?.())}
            width={150}
            height={104}
          >
            <View style={{ alignItems: "center" }}>
              <Label name={ghost.name} cta="+ 여기에 기록 추가" />
              <GhostPin />
            </View>
          </NaverMapMarkerOverlay>
        )}
      </NaverMapView>

      {/*
        종이 톤 — 웹은 CSS 필터(`saturate(.55) sepia(.22) …`)로 냈지만 네이티브 지도에는
        필터를 걸 수 없습니다. 정식 해법은 NCP 콘솔에 종이톤 커스텀 스타일을 등록하고
        style id 로 불러오는 것입니다(§4.1). 그전까지의 임시 덮개입니다 — 마커까지
        살짝 흐려지므로, 스타일 id 가 준비되면 이 View 를 지우세요.
      */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(246,243,236,0.18)",
        }}
      />
    </View>
  );
});

export default NaverMap;

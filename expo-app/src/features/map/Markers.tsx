import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";
import { memo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { BOOKMARK_PATH } from "@/components/icons";
import { pinColor } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

/** 이 줌 이상에서만 이름표를 보여줍니다(웹 LABEL_ZOOM). */
export const LABEL_ZOOM = 15;

/** 물방울 한 장 — 핸드오프 §4.1: border-radius+rotate 대신 SVG path 하나로 그립니다. */
const DROP = "M12 29.5C12 29.5 3 18.6 3 11.2a9 9 0 0 1 18 0c0 7.4-9 18.3-9 18.3Z";

function Tag({ name, rating, cta }: { name: string; rating?: number | null; cta?: string }) {
  return (
    <View
      style={[
        {
          alignSelf: "center", borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingTop: 7, paddingBottom: 6,
          paddingHorizontal: 12, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomRightRadius: 14, borderBottomLeftRadius: 3,
        },
        SHADOW.card,
      ]}
    >
      <Text numberOfLines={1} style={{ fontFamily: F.sansBd, fontSize: 13, color: C.ink }}>{name}</Text>
      {rating !== undefined && (
        <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>★ {rating == null ? "—" : rating.toFixed(1)}</Text>
      )}
      {cta && <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>{cta}</Text>}
    </View>
  );
}

const tagWidth = (name: string) => Math.min(190, Math.max(64, name.length * 13 + 26));

type Base = { lat: number; lng: number; onTap?: () => void; zIndex?: number };

type RecordProps = Base & { name: string; category: string | null; revisit: boolean; rating: number | null; active: boolean; planned: boolean; showLabel: boolean };

/** 기록 핀 — 재방문이면 색이 차고, 한 번만 간 곳은 종이색 바탕에 색 테두리. */
export const RecordMarker = memo(function RecordMarker(p: RecordProps) {
  const base = pinColor(p.category);
  const fill = p.revisit ? base : C.card;
  const stroke = p.revisit ? C.card : base;
  const core = p.revisit ? C.card : base;
  const size = p.active ? 38 : 29;
  const labelW = p.showLabel ? tagWidth(p.name) : 0;
  const w = Math.max(size, labelW);
  const labelH = p.showLabel ? 44 : 0;

  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={labelH + size + 4} onTap={p.onTap} zIndex={p.zIndex ?? (p.active ? 1000 : 0)}>
      <View style={{ width: w, height: labelH + size + 4, alignItems: "center", justifyContent: "flex-end" }}>
        {p.showLabel && <View style={{ width: labelW, marginBottom: 2 }}><Tag name={p.name} rating={p.rating} /></View>}
        <Svg width={size} height={size + 4} viewBox="0 0 24 30">
          <Path d={DROP} fill={fill} stroke={stroke} strokeWidth={p.active ? 2 : 1.5} />
          <Circle cx="12" cy="11.2" r={p.active ? 3.6 : 3} fill={core} />
        </Svg>
        {p.planned && (
          <View style={{ position: "absolute", right: w / 2 - size / 2 - 3, bottom: size - 6, width: 15, height: 15, borderRadius: 8, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Svg width={9} height={9} viewBox="0 0 24 24" fill={C.brick}><Path d={BOOKMARK_PATH} /></Svg>
          </View>
        )}
      </View>
    </NaverMapMarkerOverlay>
  );
});

type WishProps = Base & { name: string; category: string | null; showLabel: boolean };

/** 위시 마커 — 책갈피 모양(BookmarkIcon 의 path 그대로). 기록 핀과 모양으로 갈립니다. */
export const WishMarker = memo(function WishMarker(p: WishProps) {
  const labelW = p.showLabel ? tagWidth(p.name) : 0;
  const w = Math.max(30, labelW);
  const labelH = p.showLabel ? 44 : 0;
  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={labelH + 30} onTap={p.onTap} zIndex={500}>
      <View style={{ width: w, height: labelH + 30, alignItems: "center", justifyContent: "flex-end" }}>
        {p.showLabel && <View style={{ width: labelW, marginBottom: 2 }}><Tag name={p.name} /></View>}
        <Svg width={28} height={28} viewBox="0 0 24 24" fill={pinColor(p.category)} stroke={C.card} strokeWidth={1.6} strokeLinejoin="round">
          <Path d={BOOKMARK_PATH} />
        </Svg>
      </View>
    </NaverMapMarkerOverlay>
  );
});

/** 검색으로 고른, 아직 기록에 없는 자리 — 점선 흐린 핀 + 「+ 여기에 기록 추가」. */
export const GhostMarker = memo(function GhostMarker(p: Base & { name: string }) {
  const w = tagWidth(p.name) + 30;
  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={44 + 12 + 34} onTap={p.onTap} zIndex={1200}>
      <View style={{ width: w, height: 90, alignItems: "center", justifyContent: "flex-end" }}>
        <View style={{ width: w - 6, marginBottom: 2 }}><Tag name={p.name} cta="+ 여기에 기록 추가" /></View>
        <Svg width={29} height={34} viewBox="0 0 24 30">
          <Path d={DROP} fill="rgba(138,131,119,.15)" stroke={C.faint} strokeWidth={1.5} strokeDasharray="3 2.5" />
        </Svg>
      </View>
    </NaverMapMarkerOverlay>
  );
});

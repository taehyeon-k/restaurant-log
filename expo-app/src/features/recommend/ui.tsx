import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";
import { memo } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useResnap } from "@/features/map/Markers";
import { C, F } from "@/theme";

/**
 * 추천 탭 v2 의 작은 조각들 — 알약 뒤로가기 · 지도 번호 마커 · 내 위치 · 투어 도장.
 */

export const REC = {
  ink: "#1c1a17", paper: "#fbfaf6", accent: "#e08a63", sub: "#c9c2b4", quiet: "#a8a196", label: "#8a8377",
  dot: "#d8d3c8", here: "#4f6b7a", ring: "#c9a593", excBg: "#f2e0d5", excInk: "#a34d27", trend: "#6b5a8e", season: "#4f6b7a",
  noteBg: "#f7ece5", noteInk: "#8f4323", chipLine: "#e0c3b1",
} as const;

/** 「‹ 둘러보기」 알약 — 높이 40, radius 20. */
export function BackPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}로 돌아가기`}
      style={{ alignSelf: "flex-start", height: 40, borderRadius: 20, borderWidth: 1, borderColor: REC.dot, backgroundColor: C.card, paddingLeft: 10, paddingRight: 14, flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
      <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}

const textBase = { includeFontPadding: false, textAlignVertical: "center" } as const;

/** 말풍선 이름 — 검정 바탕 11/500 흰 글자. */
const bubbleW = (name: string) => Math.min(160, Math.max(48, name.length * 11 + 20));

/**
 * 지도 번호 마커(§5-3). 기본 22px 종이색 + 벽돌 테두리, 고른 가게는 30px 벽돌색 + 흰 테두리 + 위에 가게명 말풍선.
 * 네이티브가 마커 뷰를 비트맵으로 찍어 두므로 생김새가 바뀌면 key 를 바꿉니다(Markers.tsx 와 같은 까닭).
 */
export const NumberMarker = memo(function NumberMarker(p: {
  lat: number; lng: number; n: number; name: string; active: boolean; label?: boolean; onTap?: () => void;
}) {
  const d = p.active ? 30 : 22;
  const showName = p.active || p.label;
  const w = showName ? Math.max(d + 12, bubbleW(p.name)) : d + 12;
  const h = showName ? d + 12 + 30 : d + 12;
  const snapKey = useResnap(`${p.n}/${p.active}/${showName}/${p.name}`);
  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={h} anchor={{ x: 0.5, y: 1 - (d / 2 + 6) / h }} onTap={p.onTap} zIndex={p.active ? 2000 : 1000 - p.n}>
      <View key={snapKey} collapsable={false} style={{ width: w, height: h, alignItems: "center", justifyContent: "flex-end" }}>
        {showName && (
          <View style={{ marginBottom: 4, maxWidth: w, borderRadius: 8, backgroundColor: p.active ? REC.ink : "rgba(28,26,23,.78)", paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text numberOfLines={1} style={[textBase, { fontFamily: F.sansMd, fontSize: 11, lineHeight: 14, color: "#ffffff" }]}>{p.name}</Text>
          </View>
        )}
        <View style={{ width: d + 12, height: d + 12, alignItems: "center", justifyContent: "center" }}>
          <View
            style={{
              width: d, height: d, borderRadius: d / 2, alignItems: "center", justifyContent: "center",
              borderWidth: p.active ? 2 : 1.5, borderColor: p.active ? "#ffffff" : C.brick, backgroundColor: p.active ? C.brick : REC.paper,
              shadowColor: C.brick, shadowOpacity: p.active ? 0.45 : 0, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: p.active ? 6 : 0,
            }}
          >
            <Text style={[textBase, { fontFamily: F.mono, fontSize: p.active ? 12 : 10, lineHeight: 14, fontWeight: "700", color: p.active ? "#ffffff" : C.brick }]}>{p.n}</Text>
          </View>
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
});

/** 내 위치 — 점 14px + 흰 테두리 + 연한 원 28px. */
export const HereMarker = memo(function HereMarker({ lat, lng }: { lat: number; lng: number }) {
  return (
    <NaverMapMarkerOverlay latitude={lat} longitude={lng} width={32} height={32} anchor={{ x: 0.5, y: 0.5 }} zIndex={3000}>
      <View key="here" collapsable={false} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(79,107,122,.18)" }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#ffffff", backgroundColor: REC.here }} />
      </View>
    </NaverMapMarkerOverlay>
  );
});

/** 거리 범위 라벨(「1km」) — 원 위 꼭대기에 붙입니다. */
export const RingLabelMarker = memo(function RingLabelMarker({ lat, lng, text }: { lat: number; lng: number; text: string }) {
  const w = text.length * 10 + 16;
  const snapKey = useResnap(text);
  return (
    <NaverMapMarkerOverlay latitude={lat} longitude={lng} width={w} height={22} anchor={{ x: 0.5, y: 0.5 }} zIndex={100}>
      <View key={snapKey} collapsable={false} style={{ width: w, height: 22, alignItems: "center", justifyContent: "center" }}>
        <View style={{ borderRadius: 9, backgroundColor: "rgba(251,250,246,.92)", paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={[textBase, { fontFamily: F.mono, fontSize: 9.5, lineHeight: 12, color: REC.excInk }]}>{text}</Text>
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
});

/** 경로 가운데 「450m」. */
export const RouteLabelMarker = RingLabelMarker;

/** 「● 내 위치」 범례 — 지도 오른쪽 아래. */
export function HereLegend({ label = "내 위치" }: { label?: string }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, backgroundColor: "rgba(251,250,246,.92)", paddingHorizontal: 8, paddingVertical: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: REC.here }} />
      <Text style={{ fontFamily: F.sans, fontSize: 10, color: C.muted }}>{label}</Text>
    </View>
  );
}

/** 투어 도장 — 찍힘: 벽돌색 원 + ✓, 남음: 점선 원 + 번호. */
export function Stamp({ done, n, size = 46 }: { done: boolean; n: number; size?: number }) {
  const c = size / 2, r = c - 1.5;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {done ? (
          <>
            <Circle cx={c} cy={c} r={r} fill={C.brick} />
            <Path d={`M${size * 0.32} ${size * 0.52}l${size * 0.12} ${size * 0.12} ${size * 0.24} -${size * 0.26}`} stroke="#ffffff" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <Circle cx={c} cy={c} r={r} fill="none" stroke={REC.ring} strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </Svg>
      {!done && <Text style={{ fontFamily: F.mono, fontSize: Math.round(size * 0.3), color: REC.ring }}>{n}</Text>}
    </View>
  );
}

/** 섹션 머리 — Gowun Batang 16 + 오른쪽 Mono 보조. */
export function SectionHead({ title, right }: { title: string; right?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>{title}</Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>{right}</Text>}
    </View>
  );
}

/** 「카카오맵에서 보기」 — 영업시간은 여기서 확인합니다. 12 #8a8377, 밑줄 없음, 터치 44. place_url 이 없으면 그리지 않습니다. */
export function KakaoLink({ url }: { url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }}
      style={{ alignSelf: "flex-start", minHeight: 20, justifyContent: "center", marginTop: 2 }}
    >
      <Text style={{ fontFamily: F.sans, fontSize: 12, color: REC.label }}>카카오맵에서 보기</Text>
    </Pressable>
  );
}

import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";
import { memo, type ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { BOOKMARK_PATH } from "@/components/icons";
import { pinColor } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

/** 이 줌 이상에서만 이름표를 보여줍니다(웹 LABEL_ZOOM). */
export const LABEL_ZOOM = 15;

/**
 * 웹 물방울 핀(MobileMap pinHtml) 그대로 — 지름 size 의 원에 아래로 직각 꼭짓점 하나.
 * 웹은 정사각형을 border-radius 50% 50% 50% 0 + rotate(-45deg) 로 그려서 꼭짓점이 중심에서 size/2·√2 아래에 옵니다.
 * 테두리는 안쪽에 그려지므로(box-sizing) 선 중심 반지름은 size/2 - stroke/2 입니다.
 */
const dropPath = (size: number, stroke: number) => {
  const c = size / 2, r = c - stroke / 2, t = r / Math.SQRT2;
  return `M${c} ${c + r * Math.SQRT2}L${c + t} ${c + t}A${r} ${r} 0 1 0 ${c - t} ${c + t}Z`;
};
/** 물방울 SVG 의 높이 — 원 위쪽 반 + 꼭짓점까지. */
const dropH = (size: number) => size / 2 + (size / 2) * Math.SQRT2;

/* 이름표 줄 높이 — 웹 line-height:1.25. Noto Sans KR 기본 줄 높이는 훨씬 커서 고정하지 않으면 이름표가 넘쳐 윗줄(가게 이름)이 잘립니다. */
const NAME_LH = 16;
const SUB_LH = 14;
const tagHeight = (sub: "none" | "rating" | "cta") => 2 + 7 + 6 + NAME_LH + (sub === "none" ? 0 : SUB_LH) + (sub === "cta" ? 1 : 0);
/** 웹 이름표는 마커 기준점에서 bottom:42px(상자 바닥) 위에 놓입니다 — 상자 바닥은 기준점 아래 A px. */
const LABEL_BOTTOM = 42;

const textBase = { includeFontPadding: false, textAlignVertical: "center" } as const;

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
      <Text numberOfLines={1} style={[textBase, { fontFamily: F.sansBd, fontSize: 13, lineHeight: NAME_LH, color: C.ink }]}>{name}</Text>
      {rating !== undefined && (
        <Text style={[textBase, { fontFamily: F.sans, fontSize: 11, lineHeight: SUB_LH, color: C.muted }]}>★ {rating == null ? "—" : rating.toFixed(1)}</Text>
      )}
      {cta && <Text style={[textBase, { marginTop: 1, fontFamily: F.sans, fontSize: 11, lineHeight: SUB_LH, color: C.brick }]}>{cta}</Text>}
    </View>
  );
}

/** 이름표 — 마커 상자 가운데, 바닥에서 LABEL_BOTTOM 위. */
function LabelAt({ children }: { children: ReactNode }) {
  return <View style={{ position: "absolute", left: 0, right: 0, bottom: LABEL_BOTTOM, alignItems: "center" }}>{children}</View>;
}

/** 핀 아래 바닥 그림자(웹 data-shadow). */
function GroundShadow({ w, h, opacity }: { w: number; h: number; opacity: number }) {
  return <View style={{ position: "absolute", bottom: 4, alignSelf: "center", width: w, height: h, borderRadius: h, backgroundColor: `rgba(28,26,23,${opacity})` }} />;
}

/** 상자 높이 H, 기준점이 바닥에서 a px 위일 때의 앵커. */
const anchorAt = (h: number, a: number) => ({ x: 0.5, y: (h - a) / h });

/**
 * 마커 안 최상위 View 에는 collapsable={false} 와 이 key 가 꼭 붙어야 합니다(라이브러리 문서).
 * 레이아웃 스타일만 있는 View 는 New Architecture 가 납작하게 지워버려서(view flattening),
 * 네이티브 마커가 자식 뷰를 못 받고 기본 초록 핀(image 기본값)으로 그려집니다.
 * 네이티브는 이 뷰를 비트맵으로 한 번 찍어두므로, 생김새가 바뀌면 key 도 바꿔 다시 찍게 합니다.
 */
const markerKey = (...deps: unknown[]) => deps.join("/");

const tagWidth = (name: string) => Math.min(220, Math.max(64, name.length * 13 + 26));

type Base = { lat: number; lng: number; onTap?: () => void; zIndex?: number };

type RecordProps = Base & { name: string; category: string | null; revisit: boolean; rating: number | null; active: boolean; planned: boolean; showLabel: boolean };

/** 기록 핀 — 재방문이면 색이 차고, 한 번만 간 곳은 종이색 바탕에 색 테두리. 크기·위치는 웹 MobileMap 과 같습니다(기준점 = 상자 바닥에서 6px). */
export const RecordMarker = memo(function RecordMarker(p: RecordProps) {
  const base = pinColor(p.category);
  const fill = p.revisit ? base : C.card;
  const stroke = p.revisit ? C.card : base;
  const core = p.revisit ? C.card : base;
  const size = p.active ? 30 : 23;
  const dot = p.active ? 10 : 8;
  const sw = p.active ? 2 : 1.5;
  const labelW = p.showLabel ? tagWidth(p.name) : 0;
  const w = Math.max(size + 22, labelW);
  const h = p.showLabel ? LABEL_BOTTOM + tagHeight("rating") : size + 15 + 2;
  // 웹: 회전 전 정사각형 바닥이 bottom:8 → 원 중심은 8 + size/2, 꼭짓점은 그 아래 size/2·√2.
  const center = 8 + size / 2;

  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={h} anchor={anchorAt(h, 6)} onTap={p.onTap} zIndex={p.zIndex ?? (p.active ? 1000 : 0)}>
      <View key={markerKey(w, h, size, fill, stroke, p.planned, p.showLabel && p.name, p.showLabel && p.rating)} collapsable={false} style={{ width: w, height: h }}>
        <GroundShadow w={p.active ? 12 : 9} h={p.active ? 4 : 3} opacity={0.16} />
        <Svg width={size} height={dropH(size)} style={{ position: "absolute", alignSelf: "center", bottom: center - (size / 2) * Math.SQRT2 }}>
          <Path d={dropPath(size, sw)} fill={fill} stroke={stroke} strokeWidth={sw} />
        </Svg>
        <View style={{ position: "absolute", alignSelf: "center", bottom: center - dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: core }} />
        {p.planned && (
          <View style={{ position: "absolute", left: w / 2 + size / 2 - 5, bottom: size, width: 15, height: 15, borderRadius: 8, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Svg width={9} height={9} viewBox="0 0 24 24" fill={C.brick}><Path d={BOOKMARK_PATH} /></Svg>
          </View>
        )}
        {p.showLabel && <LabelAt><Tag name={p.name} rating={p.rating} /></LabelAt>}
      </View>
    </NaverMapMarkerOverlay>
  );
});

type WishProps = Base & { name: string; category: string | null; showLabel: boolean };

/** 위시 마커 — 책갈피 모양(BookmarkIcon 의 path 그대로), 웹 wishPinHtml 과 같은 26px. 기준점 = 상자 바닥에서 10px(책갈피 끝). */
export const WishMarker = memo(function WishMarker(p: WishProps) {
  const labelW = p.showLabel ? tagWidth(p.name) : 0;
  const w = Math.max(36, labelW);
  const h = p.showLabel ? LABEL_BOTTOM + tagHeight("none") : 8 + 26 + 2;
  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={h} anchor={anchorAt(h, 10)} onTap={p.onTap} zIndex={500}>
      <View key={markerKey(w, h, p.category, p.showLabel && p.name)} collapsable={false} style={{ width: w, height: h }}>
        <GroundShadow w={8} h={2.5} opacity={0.16} />
        <Svg width={26} height={26} viewBox="0 0 24 24" fill={pinColor(p.category)} stroke={C.card} strokeWidth={1.6} strokeLinejoin="round" style={{ position: "absolute", alignSelf: "center", bottom: 8 }}>
          <Path d={BOOKMARK_PATH} />
        </Svg>
        {p.showLabel && <LabelAt><Tag name={p.name} /></LabelAt>}
      </View>
    </NaverMapMarkerOverlay>
  );
});

/** 검색으로 고른, 아직 기록에 없는 자리 — 점선 흐린 핀 + 「+ 여기에 기록 추가」. 웹 ghostIcon(24px, 기준점 = 바닥에서 8px). */
export const GhostMarker = memo(function GhostMarker(p: Base & { name: string }) {
  const w = tagWidth(p.name) + 30;
  const h = LABEL_BOTTOM + tagHeight("cta");
  const center = 8 + 12;
  return (
    <NaverMapMarkerOverlay latitude={p.lat} longitude={p.lng} width={w} height={h} anchor={anchorAt(h, 8)} onTap={p.onTap} zIndex={1200}>
      <View key={markerKey(w, h, p.name)} collapsable={false} style={{ width: w, height: h }}>
        <GroundShadow w={9} h={3} opacity={0.1} />
        <Svg width={24} height={dropH(24)} style={{ position: "absolute", alignSelf: "center", bottom: center - 12 * Math.SQRT2 }}>
          <Path d={dropPath(24, 1.5)} fill="rgba(138,131,119,.15)" stroke={C.faint} strokeWidth={1.5} strokeDasharray="3 2.5" />
        </Svg>
        <LabelAt><Tag name={p.name} cta="+ 여기에 기록 추가" /></LabelAt>
      </View>
    </NaverMapMarkerOverlay>
  );
});

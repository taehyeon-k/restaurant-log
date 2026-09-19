/**
 * 모바일 화면이 함께 쓰는 조각들 — 도형, 별점, 돼지, 사진 자리.
 * 웹 `src/app/_components/mobile/ui.tsx` 를 react-native-svg 로 옮긴 것입니다.
 * 값은 같습니다 — 달라 보이면 웹 쪽이 기준입니다.
 */
import { useState } from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  ClipPath,
} from "react-native-svg";
import { pinColor } from "@/lib/types";
import { feltLevel, type PriceRow } from "@/lib/price";
import { C, FONT } from "@/lib/theme";

const PIGGY = require("../../assets/piggy.png");

/**
 * 라벨첩 버튼 아이콘 = 24각 버스트 (인증 뱃지와는 다른 모양입니다).
 * 웹의 clip-path polygon 좌표를 0–100 좌표계 그대로 SVG points 로 옮겼습니다.
 */
export const BURST_POINTS =
  "50,0 60.6,10.4 75,6.7 79,21 93.3,25 89.6,39.4 100,50 89.6,60.6 93.3,75 79,79 75,93.3 60.6,89.6 50,100 39.4,89.6 25,93.3 21,79 6.7,75 10.4,60.6 0,50 10.4,39.4 6.7,25 21,21 25,6.7 39.4,10.4";

export const CLIP_POINTS = {
  burst: BURST_POINTS,
  check: BURST_POINTS,
  hex: "50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25",
  shield: "50,0 100,17 100,60 50,100 0,60 0,17",
  oct: "30.9,3.8 69.1,3.8 96.2,30.9 96.2,69.1 69.1,96.2 30.9,96.2 3.8,69.1 3.8,30.9",
  /** 보안관 배지 — 육각 별. 등급이 달라도 모양은 하나, 색만 바뀝니다. */
  sheriff:
    "50,0 68,18.8 93.3,25 86,50 93.3,75 68,81.2 50,100 32,81.2 6.7,75 14,50 6.7,25 32,18.8",
} as const;

/** 24각 버스트 한 장 — 라벨첩 버튼·인증 뱃지 옆 작은 표시. */
export function Burst({ size = 18, color = C.brick }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polygon points={BURST_POINTS} fill={color} />
    </Svg>
  );
}

/**
 * 방문 인증 뱃지 — 물방울(정사각형을 45도 돌려 모서리 하나를 뾰족하게) 위에
 * 흰 원을 얹고 벽돌색 체크를 넣습니다. 웹은 CSS transform 으로 그렸지만
 * RN 에서는 `borderRadius: 50% 50% 50% 0` 이 없어 SVG path 한 장으로 그립니다.
 */
export function VerifiedMark({ size = 26, shadow = false }: { size?: number; shadow?: boolean }) {
  const shadowStyle: ViewStyle = shadow
    ? {
        shadowColor: C.ink,
        shadowOpacity: 0.22,
        shadowRadius: 4,
        shadowOffset: { width: 1, height: -1 },
        elevation: 3,
      }
    : {};

  return (
    <View style={[{ width: size, height: size }, shadowStyle]} accessibilityLabel="인증">
      <Svg width={size} height={size} viewBox="0 0 32 32">
        {/* 물방울 — 왼쪽 아래가 뾰족합니다(지도 핀과 같은 모양). */}
        <Path
          d="M3 29 L3 13.5 A11.5 11.5 0 1 1 18.5 29 Z"
          fill={C.brick}
          stroke="#f7ece5"
          strokeWidth={1.2}
        />
        <Circle cx="17.2" cy="14.8" r="7.1" fill={C.card} />
        <Path
          d="M13.6 15.1 L16.2 17.7 L21.1 12.3"
          fill="none"
          stroke="#a8491f"
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * 부분 채움 별점 — 웹은 겹친 두 줄을 width % 로 잘랐습니다. RN 은 퍼센트 폭으로
 * overflow 를 자를 수 있으니 같은 방식을 그대로 씁니다.
 */
export function MobileStars({
  rating,
  size = 12.5,
  gap = 1,
}: {
  rating: number | null;
  size?: number;
  gap?: number;
}) {
  const value = Math.max(0, Math.min(5, rating ?? 0));
  const style = {
    fontSize: size,
    letterSpacing: gap,
    lineHeight: size * 1.15,
  } as const;

  return (
    <View accessibilityLabel={`별점 ${value} / 5`}>
      <Text style={[style, { color: "#ded8cb" }]}>★★★★★</Text>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${(value / 5) * 100}%`,
          overflow: "hidden",
        }}
      >
        <Text style={[style, { color: C.brick }]}>★★★★★</Text>
      </View>
    </View>
  );
}

/** 체감 가격 돼지 다섯 마리. */
export function Pigs({ row, w = 15, h = 14 }: { row: PriceRow; w?: number; h?: number }) {
  const level = feltLevel(row);

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
      accessibilityLabel={`체감 가격 ${level} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Image
          key={n}
          source={PIGGY}
          style={{ width: w, height: h, opacity: n <= level ? 1 : 0.3 }}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

/**
 * 사진이 있으면 덮어 채우고, 없으면 종류 색의 사선 스트라이프.
 * 웹은 `repeating-linear-gradient` 였지만 RN 에는 없어 SVG 선으로 다시 그립니다.
 */
export function PhotoFill({
  src,
  category,
  style,
  radius = 0,
  children,
}: {
  src?: string | null;
  category: string | null;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: React.ReactNode;
}) {
  const color = pinColor(category);

  return (
    <View style={[{ overflow: "hidden", borderRadius: radius, backgroundColor: "#ded8cb" }, style]}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Stripes color={color} />
      )}
      {children != null && (
        <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>{children}</View>
      )}
    </View>
  );
}

/** 사선 줄무늬 — 9px 채움 / 9px 옅음, 웹의 135deg 반복 그라디언트와 같은 리듬입니다. */
function Stripes({ color }: { color: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const span = box.w + box.h;

  return (
    <View
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {span > 0 && (
        <Svg width={box.w} height={box.h}>
          {Array.from({ length: Math.ceil(span / 18) + 1 }, (_, i) => i * 18 - box.h).map((x) => (
            <G key={x}>
              <Line x1={x} y1={0} x2={x + box.h} y2={box.h} stroke={color} strokeOpacity={0.13} strokeWidth={9} />
              <Line
                x1={x + 9}
                y1={0}
                x2={x + 9 + box.h}
                y2={box.h}
                stroke={color}
                strokeOpacity={0.06}
                strokeWidth={9}
              />
            </G>
          ))}
        </Svg>
      )}
    </View>
  );
}

/* ── 아이콘 ─────────────────────────────────────── */

export const SearchIcon = ({ size = 15, stroke = C.faint }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Circle cx="7" cy="7" r="4.6" stroke={stroke} strokeWidth={1.6} />
    <Path d="M10.5 10.5L14 14" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

export const CameraIcon = ({
  size = 25,
  stroke = C.card,
  width = 1.7,
}: {
  size?: number;
  stroke?: string;
  width?: number;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2.5" y="5.5" width="19" height="14" rx="3.5" />
      <Circle cx="12" cy="12.5" r="4" />
      <Path d="M8 5.5L9.4 3h5.2l1.4 2.5" />
    </G>
  </Svg>
);

export const PlusIcon = ({ size = 20, stroke = C.ink }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

/** 보관함(서류철) — 기록이 모여 있는 곳이므로 폴더 모양을 씁니다. */
export const DraftsBoxIcon = ({ size = 23, stroke = C.ink }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7.4V19a1.4 1.4 0 0 0 1.4 1.4h15.2A1.4 1.4 0 0 0 21 19V9.2a1.4 1.4 0 0 0-1.4-1.4h-7L10.4 5.2a1.4 1.4 0 0 0-1.1-.6H4.4A1.4 1.4 0 0 0 3 6v1.4Z" />
      <Path d="M7.2 13.2h9.6" />
      <Path d="M7.2 16.6h6" />
    </G>
  </Svg>
);

/**
 * 책갈피 — 위시(가고싶다)를 나타내는 단 하나의 도형입니다. 하단 탭 아이콘,
 * SpotPicker 십자, 「계획 추가」, WISH MET 카드, 지도 위시 마커가 모두 이 path 를
 * 씁니다. 점선 변형은 두지 않습니다 — 작아지면 안 보이기 때문입니다.
 */
export const BOOKMARK_PATH =
  "M6.5 2.6h11a1.4 1.4 0 0 1 1.4 1.4v17a.6.6 0 0 1-.95.49L12 16.7l-5.95 4.79a.6.6 0 0 1-.95-.49V4a1.4 1.4 0 0 1 1.4-1.4Z";

export const BookmarkIcon = ({
  size = 20,
  fill = "none",
  stroke = C.ink,
  strokeWidth = 1.6,
}: {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={BOOKMARK_PATH} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const BellIcon = ({ size = 15, stroke = C.muted }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5c-3 0-5 2.2-5 5.4v3.3c0 1-.4 2-1.2 2.9l-.7.8h13.8l-.7-.8c-.8-.9-1.2-1.9-1.2-2.9V8.9c0-3.2-2-5.4-5-5.4Z" />
      <Path d="M9.6 19.5a2.4 2.4 0 0 0 4.8 0" />
    </G>
  </Svg>
);

export const ExternalLinkIcon = ({ size = 15, stroke = C.muted }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6H5.5A2.5 2.5 0 0 0 3 8.5v10A2.5 2.5 0 0 0 5.5 21h10a2.5 2.5 0 0 0 2.5-2.5V15" />
      <Path d="M14 3h7v7" />
      <Path d="m21 3-10.5 10.5" />
    </G>
  </Svg>
);

export const PinIcon = ({ size = 15, stroke = C.brick }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s7-6.3 7-11.3A7 7 0 005 9.7C5 14.7 12 21 12 21z" />
      <Circle cx="12" cy="9.7" r="2.4" />
    </G>
  </Svg>
);

export const FlashIcon = ({
  size = 19,
  stroke = C.card,
  mode = "off",
}: {
  size?: number;
  stroke?: string;
  mode?: "off" | "on" | "auto";
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinejoin="round"
      fill={mode === "on" ? stroke : "none"}
    />
    {mode === "off" && <Path d="M4 3l16 18" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />}
  </Svg>
);

export const FlipIcon = ({ size = 20, stroke = "rgba(251,250,246,.65)" }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <Path d="M20.5 4.5v4.2h-4.2" />
    </G>
  </Svg>
);

export const FilterIcon = ({ size = 13, stroke = C.muted }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.9} strokeLinecap="round">
      <Path d="M4 7h16" />
      <Path d="M7 12h10" />
      <Path d="M10 17h4" />
    </G>
  </Svg>
);

export const LocateIcon = ({ size = 19, stroke = C.ink }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={stroke} strokeWidth={1.6} strokeLinecap="round">
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </G>
  </Svg>
);

/* ── 글자 조각 ──────────────────────────────────── */

/** 라벨(작은 대문자 모노) — 상세·폼 화면의 섹션 머리말 */
export const Eyebrow = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <Text
    style={{
      fontFamily: FONT.mono,
      fontSize: 10,
      color: C.faint,
      letterSpacing: wide ? 10 * 0.22 : 10 * 0.16,
    }}
  >
    {children}
  </Text>
);

export const Serif = ({
  children,
  size = 16,
  bold = true,
  color = C.ink,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  bold?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}) => (
  <Text
    numberOfLines={numberOfLines}
    style={[
      { fontFamily: bold ? FONT.serifBold : FONT.serif, fontSize: size, color },
      style as never,
    ]}
  >
    {children}
  </Text>
);

/** 44×44 원형 뒤로가기 */
export const BackButton = ({
  onPress,
  label = "←",
  style,
}: {
  onPress: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="뒤로"
    hitSlop={8}
    style={[
      { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
      style,
    ]}
  >
    <Text style={{ fontSize: 17, color: C.ink }}>{label}</Text>
  </Pressable>
);

/** 낱말 칩 — 웹 `chipClass` 와 같은 값. */
export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        {
          minHeight: 36,
          justifyContent: "center",
          borderRadius: 18,
          borderWidth: 1,
          paddingHorizontal: 13,
          borderColor: active ? C.brick : "#cdc6b8",
          backgroundColor: active ? C.brick : "transparent",
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 12.5, color: active ? "#fdf9f3" : "#4a453d", fontFamily: FONT.sans }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 맛집 / 카페 세그먼트 — 촬영 흐름·폼이 함께 씁니다. */
export function KindSegment({
  value,
  onChange,
  fill = false,
}: {
  value: "restaurant" | "cafe";
  onChange: (k: "restaurant" | "cafe") => void;
  /** true 면 두 칸이 폭을 반씩 나눠 가집니다(「여기 어디예요?」). */
  fill?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.line,
        backgroundColor: C.card,
        padding: 3,
      }}
    >
      {(["restaurant", "cafe"] as const).map((k) => (
        <Pressable
          key={k}
          onPress={() => onChange(k)}
          style={{
            flex: fill ? 1 : undefined,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 11,
            backgroundColor: value === k ? C.brick : "transparent",
          }}
        >
          <Text style={{ fontSize: 11.5, color: value === k ? C.card : C.muted, fontFamily: FONT.sans }}>
            {k === "restaurant" ? "맛집" : "카페"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 50×28 켜짐/꺼짐 스위치 — 재방문·근처 알림 토글. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onChange}
      style={{
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: checked ? C.brick : C.line,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 24 : 2,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: C.card,
          shadowColor: C.ink,
          shadowOpacity: 0.28,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

/** 폼 입력 공통 값 — 높이 48, radius 16. TextInput 에 style 로 붙입니다. */
export const fieldStyle = {
  minHeight: 48,
  width: "100%",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: C.hairline,
  backgroundColor: C.card,
  paddingHorizontal: 15,
  fontSize: 14,
  color: C.ink,
  fontFamily: FONT.sans,
} as const;

export { Defs, ClipPath };

/**
 * 종이 팔레트와 그림자 — 핸드오프 §3 의 확정값입니다.
 * 색은 tailwind.config.js 와 같은 값을 들고 있습니다. className 으로 쓸 수 없는
 * 자리(그림자·데이터에서 오는 색·SVG 속성)에서 이 상수를 씁니다.
 */
import { Platform, type ViewStyle } from "react-native";

export const C = {
  paper: "#f6f3ec",
  card: "#fbfaf6",
  ink: "#1c1a17",
  brick: "#b4552d",
  brickSoft: "#f7ece5",
  line: "#d8d3c8",
  lineSoft: "#e2ddd2",
  muted: "#6b665e",
  faint: "#8a8377",
  map: "#e7e3d8",
  mapGrid: "#dcd7c9",
  mapRoad: "#f1ede2",
  mapPark: "#dfe4d6",
  kakao: "#fee500",
  /** 본문 회색 계열 — 웹에서 인라인으로 쓰이던 값들. */
  dim: "#a29a8c",
  body: "#4d4842",
  hairline: "#ded8cb",
  placeholder: "#b3ada1",
  shoot: "#171614",
} as const;

export const FONT = {
  serif: "GowunBatang_400Regular",
  serifBold: "GowunBatang_700Bold",
  sans: "NotoSansKR_400Regular",
  sansMedium: "NotoSansKR_500Medium",
  sansBold: "NotoSansKR_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

/**
 * 그림자 — iOS 는 shadow*, Android 는 elevation 으로 근사합니다(§3).
 * RN 은 box-shadow 문자열을 받지 않으므로 className 이 아니라 style 로만 붙습니다.
 */
const shadow = (
  opacity: number,
  radius: number,
  offset: { width: number; height: number },
  elevation: number
): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: C.ink,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: offset,
    },
    android: { elevation },
    default: {},
  })!;

export const SHADOW = {
  /** 카드 — opacity .08 radius 14 offset {0,4} / elevation 2 */
  card: shadow(0.08, 14, { width: 0, height: 4 }, 2),
  /** 시트 — opacity .13 radius 30 offset {0,-10} / elevation 12 */
  sheet: shadow(0.13, 30, { width: 0, height: -10 }, 12),
  /** 큰 카드 — opacity .09 radius 32 offset {0,12} / elevation 10 */
  bigCard: shadow(0.09, 32, { width: 0, height: 12 }, 10),
  /** 탭바 — opacity .06 radius 14 offset {0,-2} / elevation 8 */
  tabBar: shadow(0.06, 14, { width: 0, height: -2 }, 8),
  /** 가운데 카메라 버튼 — 벽돌색 그림자라 shadowColor 가 다릅니다. */
  shutter: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "rgba(180,85,45,.34)",
      shadowOpacity: 1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 8 },
    default: {},
  })!,
  /** 강조 후보 행 — rgba(180,85,45,.1) radius 14 y4 */
  hotRow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "rgba(180,85,45,.1)",
      shadowOpacity: 1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 2 },
    default: {},
  })!,
} as const;

/** 반지름 — §3 간격·형태. */
export const R = {
  card: 20,
  sheet: 26,
  field: 16,
  chip: 18,
  photo: 22,
  bigCard: 30,
  thumb: 18,
} as const;

/** 탭바 높이(안전영역 제외). 시트·떠 있는 버튼이 이 값 위에서 멈춥니다. */
export const TAB_BAR_HEIGHT = 74;

/** 터치 타겟 최소 크기. */
export const HIT = 44;

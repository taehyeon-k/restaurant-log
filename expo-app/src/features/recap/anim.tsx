import { createContext, useContext, useState } from "react";
import { Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import Svg, { Path, Polygon } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { BURST_POINTS } from "@/components/icons";

/**
 * 리캡 등장 애니메이션 — 재생기 시제품의 data-a 어휘(HANDOFF quarterly recap §1 Entrance animation).
 * 장마다 하나의 시계(ms)를 두고 모든 요소가 그 시계에서 제 진행도를 읽습니다. 길게 누르면 시계만 멈추면
 * 진행 막대·등장·숫자 세기가 함께 멈춥니다.
 */
const Clock = createContext<SharedValue<number> | null>(null);
export const ClockProvider = Clock.Provider;
const useClock = () => useContext(Clock)!;

const EASE = Easing.bezierFn(0.2, 0.7, 0.2, 1);

export type Kind = "up" | "fade" | "left" | "x" | "y" | "pop" | "spin" | "zoom" | "card" | "type" | "knob";
const DUR: Record<Kind, number> = { up: 560, fade: 560, left: 560, x: 800, y: 600, pop: 560, spin: 1200, zoom: 560, card: 800, type: 1100, knob: 900 };

/** 시계가 가장 늦게 끝나는 요소보다 넉넉히 갑니다. */
export const CLOCK_END = 4000;

export function A({
  k, d = 120, style, children, to = 1, pointerEvents,
}: {
  k: Kind;
  /** 지연 ms */
  d?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** knob 전용 — 왼쪽에서 몇 %까지 미끄러지는지(0–1) */
  to?: number;
  pointerEvents?: "auto" | "none" | "box-none";
}) {
  const clock = useClock();
  const dur = DUR[k];
  const st = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (clock.value - d) / dur));
    const e = EASE(t);
    switch (k) {
      case "up":
        return { opacity: e, transform: [{ translateY: 18 * (1 - e) }] };
      case "fade":
      case "type":
        return { opacity: e };
      case "left":
        return { opacity: e, transform: [{ translateX: -28 * (1 - e) }] };
      case "x":
        return { transformOrigin: "left", transform: [{ scaleX: e }] };
      case "y":
        return { transformOrigin: "bottom", transform: [{ scaleY: e }] };
      case "pop": {
        if (e < 0.7) {
          const p = e / 0.7;
          return { opacity: p, transform: [{ scale: 0.5 + 0.56 * p }, { rotate: `${-20 + 22 * p}deg` }] };
        }
        const p = (e - 0.7) / 0.3;
        return { opacity: 1, transform: [{ scale: 1.06 - 0.06 * p }, { rotate: `${2 - 2 * p}deg` }] };
      }
      case "spin":
        return { opacity: e, transform: [{ rotate: `${-60 * (1 - e)}deg` }, { scale: 0.7 + 0.3 * e }] };
      case "zoom":
        return { opacity: e, transform: [{ scale: 0.92 + 0.08 * e }] };
      case "card":
        return { opacity: e, transform: [{ translateY: 40 * (1 - e) }, { rotate: `${-3 * (1 - e)}deg` }] };
      case "knob":
        return { left: `${to * 100 * e}%` };
    }
  });
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, st]}>
      {children}
    </Animated.View>
  );
}

/** 큰 숫자 세기 — 0 → value, 1000ms, ease-out cubic, 150ms 뒤 시작. */
export function CountUp({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const clock = useClock();
  const [n, setN] = useState(0);
  const shown = useDerivedValue(() => {
    const p = Math.min(1, Math.max(0, (clock.value - 150) / 1000));
    return Math.round(value * (1 - Math.pow(1 - p, 3)));
  });
  useAnimatedReaction(
    () => shown.value,
    (v, prev) => { if (v !== prev) scheduleOnRN(setN, v); }
  );
  return <Text style={style}>{n}</Text>;
}

/** DINARY 의 22각 별(라벨첩 버스트와 같은 점). */
export const Star = ({ size, fill }: { size: number; fill: string }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill={fill} />
  </Svg>
);

/** 별 + 체크 — 받은 라벨 로제트. */
export const Rosette = ({ size, fill }: { size: number; fill: string }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill={fill} />
    <Path d="M30 52l14 14 27-30" stroke="#fbfaf6" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

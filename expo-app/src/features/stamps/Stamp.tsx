import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { BURST_POINTS } from "@/components/icons";
import { STAMPS_PER_BOARD, stampTilt } from "@/lib/labels";
import { C, F } from "@/theme";

/** 도장 한 개 — 인증마크와 같은 24각 톱니 seal 안에 Mono 흰 숫자. */
export function Stamp({ n, size = 44, tilt = 0 }: { n?: number | string; size?: number; tilt?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${tilt}deg` }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute" }}>
        <Polygon points={BURST_POINTS} fill={C.brick} />
      </Svg>
      {n != null && <Text style={{ fontFamily: F.mono, fontSize: Math.max(9, size * 0.32), color: "#fff" }}>{n}</Text>}
    </View>
  );
}

/** 빈 칸 — 점선 원. label 이 있으면 가운데 Mono 다음 번호. */
export function EmptySlot({ size = 44, label }: { size?: number; label?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#d6c4b8", alignItems: "center", justifyContent: "center" }}>
      {label != null && <Text style={{ fontFamily: F.mono, fontSize: Math.max(9, size * 0.26), color: "#c9b5a7" }}>{label}</Text>}
    </View>
  );
}

/**
 * 방금 찍은 도장 — scale 2.2 · -18° 에서 0.92 → 1 · -8° 로 내려앉습니다(0.55s, 0.25s 뒤).
 * 다시 틀고 싶으면 key 를 바꿉니다.
 */
export function StampingIn({ n, size = 44, delay = 250, children }: { n?: number | string; size?: number; delay?: number; children?: React.ReactNode }) {
  const scale = useSharedValue(2.2);
  const rot = useSharedValue(-18);
  const op = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    op.value = withDelay(delay, withTiming(1, { duration: 120 }));
    scale.value = withDelay(delay, withSequence(withTiming(0.92, { duration: 330, easing: ease }), withTiming(1, { duration: 220, easing: ease })));
    rot.value = withDelay(delay, withTiming(-8, { duration: 550, easing: ease }));
  }, [delay, op, rot, scale]);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }] }));
  return <Animated.View style={style}>{children ?? <Stamp n={n} size={size} />}</Animated.View>;
}

/**
 * 도장판 5×2. filled 칸까지 찍혀 있고, fresh(1~10) 칸만 찍히는 애니메이션. firstNo 는 이 판의 1칸 번호(빈 칸 숫자에 씀).
 */
export function StampBoard({ filled, fresh, size = 44, gap = 10, firstNo, numberEmpty }: {
  filled: number; fresh?: number | null; size?: number; gap?: number; firstNo: number; numberEmpty?: boolean;
}) {
  const slots = Array.from({ length: STAMPS_PER_BOARD }, (_, i) => i + 1);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", width: size * 5 + gap * 4, rowGap: gap, columnGap: gap }}>
      {slots.map((k) => {
        const no = firstNo + k - 1;
        if (k > filled) return <EmptySlot key={k} size={size} label={numberEmpty ? no : undefined} />;
        if (k === fresh) return <StampingIn key={k} n={no} size={size} />;
        return <Stamp key={k} n={no} size={size} tilt={stampTilt(k - 1)} />;
      })}
    </View>
  );
}

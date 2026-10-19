import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { REC_CATEGORIES, type RecCategory } from "@/lib/recommend";
import type { Scored } from "@/lib/rec/score";
import { C, F } from "@/theme";
import { REC, SectionHead } from "./ui";

const SIZE = 260;
const R = SIZE / 2;
/** 칸 색 — 종이 · 연벽돌을 번갈아, 칸이 홀수면 마지막 칸만 한 톤 더. */
const FILLS = [C.card, C.brickSoft];
const SPIN_MS = 3200;

type Tab = "place" | "category";

/** 「면으로」 · 「한식으로」 — 받침(ㄹ 빼고) 있으면 「으로」. */
const euro = (w: string) => {
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
};

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 0° = 위, 시계 방향. */
function slicePath(a0: number, a1: number) {
  const p = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return `${R + R * Math.cos(t)} ${R + R * Math.sin(t)}`;
  };
  return `M${R} ${R} L${p(a0)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)} Z`;
}

/**
 * 룰렛 — 고민될 때 돌려서 정합니다. 「가게」는 지금 추천된 곳들 중에서, 「카테고리」는 뺀 종류를 빼고 고릅니다.
 * 카테고리가 나오면 그 종류로 다시 추천받을 수 있습니다.
 */
export function Roulette({ picks, exclude, onPlace, onCategory }: {
  picks: Scored[]; exclude: readonly string[];
  onPlace: (i: number) => void; onCategory: (cat: RecCategory) => void;
}) {
  const canPlace = picks.length >= 2;
  const [tab, setTab] = useState<Tab>(canPlace ? "place" : "category");
  useEffect(() => { if (!canPlace) setTab("category"); }, [canPlace]);

  const labels = tab === "place" ? picks.map((p) => p.c.name) : REC_CATEGORIES.filter((c) => !exclude.includes(c));
  const seg = 360 / Math.max(1, labels.length);

  const rot = useRef(new Animated.Value(0)).current;
  const deg = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  // 칸이 바뀌면(탭 · 다시 추천) 바늘을 처음으로.
  const sig = `${tab}|${labels.join("|")}`;
  useEffect(() => { setWon(null); deg.current = 0; rot.setValue(0); }, [sig, rot]);

  const spin = () => {
    if (spinning || labels.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const i = Math.floor(Math.random() * labels.length);
    // 바늘(위) 밑에 i 칸의 가운데 언저리가 오게 — 돌린 각 R 이면 위에 오는 건 바퀴의 (-R) 자리.
    const at = (i + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    const want = (360 - at + 360) % 360;
    const to = deg.current + 360 * 5 + ((want - (deg.current % 360)) + 360) % 360;
    deg.current = to;
    setWon(null);
    setSpinning(true);
    Animated.timing(rot, { toValue: to, duration: SPIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setSpinning(false);
      setWon(i);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  };

  const tabBtn = (t: Tab, label: string, disabled = false) => {
    const on = tab === t;
    return (
      <Pressable
        key={t}
        disabled={disabled || spinning}
        onPress={() => { Haptics.selectionAsync(); setTab(t); }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on, disabled }}
        style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderColor: on ? REC.ink : C.lineSoft, backgroundColor: on ? REC.ink : REC.paper, opacity: disabled ? 0.4 : 1 }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: on ? REC.paper : C.ink }}>{label}</Text>
      </Pressable>
    );
  };

  const result = won != null ? labels[won] : null;

  return (
    <View style={{ marginTop: 30 }}>
      <SectionHead title="룰렛" />
      <View style={{ marginTop: 10, flexDirection: "row", gap: 6 }}>
        {tabBtn("place", "추천된 가게", !canPlace)}
        {tabBtn("category", "카테고리")}
      </View>

      <View style={{ marginTop: 18, alignItems: "center" }}>
        {/* 바늘 — 위 가운데, 아래를 가리키는 세모 */}
        <Svg width={22} height={18} viewBox="0 0 22 18" style={{ marginBottom: -8, zIndex: 2 }}>
          <Path d="M2 2 H20 L11 16 Z" fill={C.brick} stroke={C.card} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
        <Pressable onPress={spin} accessibilityRole="button" accessibilityLabel="룰렛 돌리기">
          <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }] }}>
            <Svg width={SIZE} height={SIZE}>
              {labels.map((l, i) => {
                const fill = labels.length % 2 === 1 && i === labels.length - 1 ? C.lineSoft : FILLS[i % 2];
                const mid = (i + 0.5) * seg;
                return (
                  <G key={`${l}${i}`}>
                    <Path d={slicePath(i * seg, (i + 1) * seg)} fill={fill} stroke={C.brick} strokeWidth={1.2} />
                    <G transform={`rotate(${mid} ${R} ${R})`}>
                      <SvgText
                        x={R}
                        y={R - R * 0.64}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        fontFamily={F.sansMd}
                        fontSize={tab === "place" ? 11.5 : 13}
                        fill={C.ink}
                      >
                        {short(l, tab === "place" ? 7 : 5)}
                      </SvgText>
                    </G>
                  </G>
                );
              })}
              <Circle cx={R} cy={R} r={R - 1} fill="none" stroke={C.brick} strokeWidth={2} />
            </Svg>
          </Animated.View>
          {/* 가운데 단추 — 바퀴와 같이 돌지 않게 위에 따로 */}
          <View pointerEvents="none" style={{ position: "absolute", left: R - 30, top: R - 30, width: 60, height: 60, borderRadius: 30, backgroundColor: C.brick, borderWidth: 3, borderColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>{spinning ? "…" : "돌리기"}</Text>
          </View>
        </Pressable>
      </View>

      <View style={{ marginTop: 16, minHeight: 74, alignItems: "center" }}>
        {result != null && (
          <>
            <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, textAlign: "center" }}>{result}</Text>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); if (tab === "place") onPlace(won!); else onCategory(result as RecCategory); }}
              accessibilityRole="button"
              style={{ marginTop: 10, height: 38, borderRadius: 19, backgroundColor: C.brick, paddingHorizontal: 16, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>{tab === "place" ? "카드에서 보기" : `${result}${euro(result)} 추천받기`}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

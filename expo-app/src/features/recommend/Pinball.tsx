import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { C, F } from "@/theme";
import type { PachinkoOption } from "./Pachinko";
import { REC } from "./ui";

/** 판 높이 · 위 칸(레인) 높이 · 발사 통로 폭 · 공 · 범퍼 · 플리퍼 두께. */
const H = 380;
const TOP_H = 66;
const LANE = 26;
const BALL = 14;
const BUMP_R = 21;
const FT = 10;
const PAD = 10;
/** 플리퍼가 쉬는 각 · 쳐올리는 각(도). */
const REST = 28;
const FLICK = -22;

type Tone = { bg: string; ink: string };
type Pt = { x: number; y: number };

/**
 * 핀볼 — 오른쪽 통로에서 쏘아 올린 공이 범퍼에 몇 번 튕기고, 플리퍼가 쳐올려 위 칸(레인) 하나에 들어갑니다. 들어간 칸이 고른 것.
 * 결과를 먼저 뽑고 그 칸으로 가는 길을 만듭니다(파친코와 같은 방식). 칸 · 톤은 룰렛과 같습니다.
 */
export function Pinball({ options, tones, busy, onStart, onDone }: {
  options: PachinkoOption[]; tones: Tone[]; busy: boolean;
  onStart: () => void; onDone: (o: PachinkoOption) => void;
}) {
  const [w, setW] = useState(0);
  const inner = Math.max(0, w - PAD * 2);
  const wp = inner - LANE; // 놀이판 폭(발사 통로 빼고)
  const n = options.length;
  const ready = n >= 2 && inner > 0;
  const laneW = n ? wp / n : wp;

  const bumpers: Pt[] = [
    { x: wp * 0.28, y: TOP_H + 84 },
    { x: wp * 0.72, y: TOP_H + 84 },
    { x: wp * 0.5, y: TOP_H + 146 },
  ];
  const FL = wp * 0.27;
  const pivots = { left: { x: wp * 0.2, y: H - 46 }, right: { x: wp * 0.8, y: H - 46 } };
  const start: Pt = { x: wp + LANE / 2, y: H - 34 };

  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const flip = useRef({ left: new Animated.Value(REST), right: new Animated.Value(-REST) }).current;
  const bump = useRef([0, 1, 2].map(() => new Animated.Value(1))).current;
  const plunger = useRef(new Animated.Value(0)).current;
  const [playing, setPlaying] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const place = (p: Pt) => { x.setValue(p.x - BALL / 2); y.setValue(p.y - BALL / 2); };
  const sig = options.map((o) => o.key).join("|");
  useEffect(() => { setHit(null); place(start); }, [sig, start.x]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  function play() {
    if (!ready || busy || playing) return;
    const target = Math.floor(Math.random() * n);
    const lx = (target + 0.5) * laneW;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setHit(null);
    setPlaying(true);
    onStart();
    place(start);

    // 길 — [가는 곳, 걸리는 시간, 이징]. t 는 그 지점에 닿는 시각.
    const path: { p: Pt; d: number; e: (v: number) => number }[] = [];
    const go = (p: Pt, d: number, e = Easing.out(Easing.quad)) => path.push({ p, d, e });
    let t = 240; // 플런저를 당겼다 놓는 시간
    go({ x: start.x, y: TOP_H + 24 }, 360);
    go({ x: wp - 6, y: TOP_H + 12 }, 150, Easing.linear);
    go({ x: wp - 44, y: TOP_H + 26 }, 150, Easing.linear);

    // 범퍼 3~5번 — 같은 범퍼를 연달아 치지 않게. 닿는 자리는 범퍼 가장자리(들어오던 쪽).
    let prev: Pt = { x: wp - 44, y: TOP_H + 26 };
    let last = -1;
    const hits = 3 + Math.floor(Math.random() * 3);
    const bumpAt: { i: number; at: number }[] = [];
    for (let k = 0; k < hits; k++) {
      let i = Math.floor(Math.random() * 3);
      if (i === last) i = (i + 1 + Math.floor(Math.random() * 2)) % 3;
      const b = bumpers[i];
      const dx = prev.x - b.x, dy = prev.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      const p = { x: b.x + (dx / len) * (BUMP_R + BALL / 2), y: b.y + (dy / len) * (BUMP_R + BALL / 2) };
      go(p, 230);
      bumpAt.push({ i, at: 0 });
      prev = p;
      last = i;
    }

    // 플리퍼로 떨어져서 쳐올려 목표 칸으로.
    const side = Math.random() < 0.5 ? "left" : "right";
    const pv = pivots[side];
    const dir = side === "left" ? 1 : -1;
    const rad = (REST * Math.PI) / 180;
    const on = { x: pv.x + dir * FL * 0.62 * Math.cos(rad), y: pv.y + FL * 0.62 * Math.sin(rad) - FT / 2 - BALL / 2 };
    go(on, 460, Easing.in(Easing.quad));
    const flipIndex = path.length - 1;
    go({ x: lx, y: TOP_H - 2 }, 430);
    // 칸 아래쪽에 멈춥니다 — 글자를 가리지 않게.
    go({ x: lx, y: TOP_H - BALL / 2 - 4 }, 220, Easing.out(Easing.back(2)));

    // 시각 계산 → 범퍼 번쩍 · 플리퍼 · 진동.
    let bi = 0;
    path.forEach((step, k) => {
      t += step.d;
      if (k >= 3 && k < 3 + hits) {
        const { i } = bumpAt[bi++];
        later(t, () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Animated.sequence([
            Animated.timing(bump[i], { toValue: 1.18, duration: 70, useNativeDriver: true }),
            Animated.spring(bump[i], { toValue: 1, friction: 4, useNativeDriver: true }),
          ]).start();
        });
      }
      if (k === flipIndex) {
        later(t - 60, () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.sequence([
            Animated.timing(flip[side], { toValue: side === "left" ? FLICK : -FLICK, duration: 80, useNativeDriver: true }),
            Animated.timing(flip[side], { toValue: side === "left" ? REST : -REST, duration: 220, delay: 120, useNativeDriver: true }),
          ]).start();
        });
      }
    });

    Haptics.selectionAsync();
    Animated.sequence([
      Animated.timing(plunger, { toValue: 12, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(plunger, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(240),
      ...path.map((s) => Animated.parallel([
        Animated.timing(x, { toValue: s.p.x - BALL / 2, duration: s.d, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(y, { toValue: s.p.y - BALL / 2, duration: s.d, easing: s.e, useNativeDriver: true }),
      ])),
    ]).start(() => {
      setPlaying(false);
      setHit(target);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(options[target]);
    });
  }

  const chars = 3;
  const labelSize = Math.max(10, Math.min(12.5, laneW * 0.42));
  const deg = (v: Animated.Value) => v.interpolate({ inputRange: [-90, 90], outputRange: ["-90deg", "90deg"] });

  // 벽에서 플리퍼 축까지 내려오는 비탈.
  const slope = (side: "left" | "right") => {
    const pv = pivots[side];
    const run = side === "left" ? pv.x : wp - pv.x;
    const rad = (REST * Math.PI) / 180;
    const len = run / Math.cos(rad);
    const mid = { x: side === "left" ? pv.x / 2 : (pv.x + wp) / 2, y: pv.y - (run * Math.tan(rad)) / 2 };
    return (
      <View key={`slope-${side}`} style={{ position: "absolute", left: mid.x - len / 2, top: mid.y - 1.5, width: len, height: 3, borderRadius: 1.5, backgroundColor: "#d9cfc0", opacity: 0.75, transform: [{ rotate: `${side === "left" ? REST : -REST}deg` }] }} />
    );
  };

  const flipper = (side: "left" | "right") => {
    const pv = pivots[side];
    return (
      <Animated.View
        key={side}
        pointerEvents="none"
        style={{ position: "absolute", left: pv.x - FL, top: pv.y - FT / 2, width: FL * 2, height: FT, transform: [{ rotate: deg(flip[side]) }] }}
      >
        <View style={{ position: "absolute", top: 0, height: FT, width: FL + FT / 2, left: side === "left" ? FL - FT / 2 : 0, borderRadius: FT / 2, backgroundColor: "#f2ddcf", borderWidth: 1.5, borderColor: C.brick }} />
        <View style={{ position: "absolute", top: FT / 2 - 3, left: FL - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: C.brick }} />
      </Animated.View>
    );
  };

  return (
    <View style={{ alignItems: "center" }}>
      <View
        onLayout={(e) => setW(Math.min(320, e.nativeEvent.layout.width))}
        style={{ width: "100%", maxWidth: 320, borderRadius: 26, backgroundColor: C.ink, padding: PAD, shadowColor: C.ink, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        <View style={{ height: 10, flexDirection: "row", justifyContent: "space-evenly", alignItems: "center", marginBottom: 6 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: i % 2 ? "#f2ddcf" : "#e08a63" }} />
          ))}
        </View>

        <View style={{ height: H, borderRadius: 18, borderTopRightRadius: 44, backgroundColor: "#2a2622", overflow: "hidden" }}>
          {/* 위 칸(레인) */}
          <View style={{ position: "absolute", left: 0, top: 0, width: wp, height: TOP_H, flexDirection: "row" }}>
            {options.map((o, i) => {
              const tone = tones[i];
              const won = hit === i;
              return (
                <View key={o.key} style={{ flex: 1, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center", borderLeftWidth: i ? 1.5 : 0, borderLeftColor: "#2a2622", opacity: hit != null && !won ? 0.45 : 1 }}>
                  <Text style={{ fontFamily: F.serif, fontSize: labelSize, lineHeight: labelSize + 2, color: tone.ink, textAlign: "center" }}>
                    {[...o.label].slice(0, chars).join("\n")}{o.label.length > chars ? "…" : ""}
                  </Text>
                </View>
              );
            })}
          </View>
          {/* 레인 아래 기둥 · 발사 통로 벽 */}
          {Array.from({ length: Math.max(0, n - 1) }, (_, i) => (
            <View key={`post${i}`} style={{ position: "absolute", left: (i + 1) * laneW - 2, top: TOP_H - 4, width: 4, height: 12, borderRadius: 2, backgroundColor: "#d9cfc0" }} />
          ))}
          <View style={{ position: "absolute", left: wp - 1, top: TOP_H + 40, width: 2, bottom: 0, backgroundColor: "#d9cfc0", opacity: 0.7 }} />

          {/* 범퍼 */}
          {bumpers.map((b, i) => (
            <Animated.View
              key={`bump${i}`}
              style={{
                position: "absolute", left: b.x - BUMP_R, top: b.y - BUMP_R, width: BUMP_R * 2, height: BUMP_R * 2, borderRadius: BUMP_R,
                backgroundColor: [C.brick, "#e08a63", "#e9dcc8"][i], borderWidth: 3, borderColor: "#fbf3ec",
                alignItems: "center", justifyContent: "center", transform: [{ scale: bump[i] }],
              }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "rgba(251,243,236,.8)" }} />
            </Animated.View>
          ))}

          {/* 양 옆 비탈 · 플리퍼 */}
          {slope("left")}
          {slope("right")}
          {flipper("left")}
          {flipper("right")}

          {/* 플런저 */}
          <Animated.View style={{ position: "absolute", left: wp + 4, width: LANE - 8, top: H - 24, height: 40, transform: [{ translateY: plunger }] }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.brick }} />
            <View style={{ marginTop: 2, marginHorizontal: 6, height: 30, borderRadius: 2, backgroundColor: "#4d4842" }} />
          </Animated.View>

          {/* 공 */}
          {ready && (
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: "#d9d4cc", borderWidth: 1, borderColor: "#fbfaf6", transform: [{ translateX: x }, { translateY: y }], shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}>
              <View style={{ position: "absolute", left: 2.5, top: 2, width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: "rgba(255,255,255,.9)" }} />
            </Animated.View>
          )}
        </View>
      </View>

      <Pressable
        onPress={play}
        disabled={!ready || busy || playing}
        accessibilityRole="button"
        style={{ marginTop: 16, height: 44, borderRadius: 22, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ready ? C.ink : "#a8a196" }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#d9d4cc", borderWidth: 1.5, borderColor: REC.paper }} />
        <Text style={{ fontFamily: F.serif, fontSize: 14, color: REC.paper }}>{playing ? "튕기는 중…" : "발사"}</Text>
      </Pressable>
    </View>
  );
}

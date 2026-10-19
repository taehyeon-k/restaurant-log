import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { C, F } from "@/theme";
import { REC } from "./ui";

/** 핀 줄 수 · 짝수 줄 핀 수 · 줄 간격 · 공 · 핀 크기 · 칸 높이. */
const ROWS = 8;
const COLS = 9;
const ROW_H = 24;
const BALL = 14;
const PEG = 5;
const TOP = 26;
const SLOT_H = 84;
const PAD = 10;

export type PachinkoOption = { key: string; label: string };
type Tone = { bg: string; ink: string };

/**
 * 파친코 — 위에서 공을 떨어뜨리면 핀에 튕기며 내려가 아래 칸 하나에 들어갑니다. 들어간 칸이 고른 것.
 * 칸은 룰렛과 같은 목록 · 같은 네 톤. 결과를 먼저 뽑고, 그 칸에 닿도록 핀마다 ±반 칸씩 튕기는 길을 만듭니다.
 */
export function Pachinko({ options, tones, busy, onStart, onDone }: {
  options: PachinkoOption[]; tones: Tone[]; busy: boolean;
  onStart: () => void; onDone: (o: PachinkoOption) => void;
}) {
  const [w, setW] = useState(0);
  const inner = Math.max(0, w - PAD * 2);
  const s = inner / COLS;
  const n = options.length;
  const ready = n >= 2 && inner > 0;
  const slotW = n ? inner / n : inner;

  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const [dropping, setDropping] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startX = inner / 2 - BALL / 2;
  const startY = 2;

  // 칸이 바뀌면 공을 처음 자리로.
  const sig = options.map((o) => o.key).join("|");
  useEffect(() => {
    setHit(null);
    x.setValue(startX);
    y.setValue(startY);
  }, [sig, startX, x, y]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pegY = (r: number) => TOP + r * ROW_H;

  function drop() {
    if (!ready || busy || dropping) return;
    const target = Math.floor(Math.random() * n);
    const goal = (target + 0.5) * slotW;
    // 핀마다 ±s/2 — 남은 줄 수로 목표에 닿을 수 있는 한에서만 마음대로 튕깁니다.
    const xs: number[] = [];
    let cx = inner / 2;
    for (let r = 0; r < ROWS; r++) {
      if (r > 0) {
        const left = ROWS - r;
        const lo = r % 2 ? s : s / 2;
        const hi = r % 2 ? inner - s : inner - s / 2;
        const need = goal - cx;
        let dir = Math.random() < 0.5 ? -1 : 1;
        if (Math.abs(need) >= left * (s / 2) - s / 4) dir = need < 0 ? -1 : 1;
        let nx = cx + dir * (s / 2);
        if (nx < lo || nx > hi) nx = cx - dir * (s / 2);
        cx = nx;
      }
      xs.push(cx);
    }

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setHit(null);
    setDropping(true);
    onStart();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    x.setValue(startX);
    y.setValue(startY);

    const steps: Animated.CompositeAnimation[] = [];
    let t = 0;
    xs.forEach((px, r) => {
      const d = r === 0 ? 260 : 150 + Math.round(Math.random() * 40);
      // 핀 위에 얹히는 자리 — 공 아래가 핀 윗면에 닿게.
      const ty = pegY(r) - PEG / 2 - BALL;
      steps.push(Animated.parallel([
        Animated.timing(x, { toValue: px - BALL / 2, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: ty, duration: d, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]));
      t += d;
      timers.current.push(setTimeout(() => Haptics.selectionAsync(), t));
    });
    const landY = pegY(ROWS - 1) + ROW_H + SLOT_H - BALL - 10;
    steps.push(Animated.parallel([
      Animated.timing(x, { toValue: goal - BALL / 2, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(y, { toValue: landY, duration: 520, easing: Easing.bounce, useNativeDriver: true }),
    ]));
    Animated.sequence(steps).start(() => {
      setDropping(false);
      setHit(target);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(options[target]);
    });
  }

  const boardH = TOP + (ROWS - 1) * ROW_H + ROW_H + SLOT_H;
  const chars = Math.max(1, Math.min(4, Math.floor(SLOT_H / 17)));
  const labelSize = Math.max(10, Math.min(13, slotW * 0.42));

  return (
    <View style={{ alignItems: "center" }}>
      <View
        onLayout={(e) => setW(Math.min(320, e.nativeEvent.layout.width))}
        style={{ width: "100%", maxWidth: 320, borderRadius: 26, backgroundColor: C.ink, padding: PAD, shadowColor: C.ink, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        {/* 머리 — 작은 전구 줄 */}
        <View style={{ height: 10, flexDirection: "row", justifyContent: "space-evenly", alignItems: "center", marginBottom: 6 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: i % 2 ? "#f2ddcf" : "#e08a63", opacity: dropping && i % 2 === 0 ? 1 : 0.85 }} />
          ))}
        </View>

        <View style={{ height: boardH, borderRadius: 18, backgroundColor: "#2a2622", overflow: "hidden" }}>
          {/* 핀 — 짝수 줄 COLS 개, 홀수 줄은 사이사이(벽에 붙은 것은 빼고) */}
          {inner > 0 && Array.from({ length: ROWS }, (_, r) => {
            const xs = r % 2 ? Array.from({ length: COLS - 1 }, (_, j) => (j + 1) * s) : Array.from({ length: COLS }, (_, j) => (j + 0.5) * s);
            return xs.map((px, j) => (
              <View key={`${r}-${j}`} style={{ position: "absolute", left: px - PEG / 2, top: pegY(r) - PEG / 2, width: PEG, height: PEG, borderRadius: PEG / 2, backgroundColor: "#d9cfc0" }} />
            ));
          })}

          {/* 칸 */}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SLOT_H, flexDirection: "row" }}>
            {options.map((o, i) => {
              const tone = tones[i];
              const won = hit === i;
              return (
                <View
                  key={o.key}
                  style={{
                    flex: 1, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center",
                    borderLeftWidth: i ? 1.5 : 0, borderLeftColor: "#2a2622",
                    opacity: hit != null && !won ? 0.45 : 1,
                  }}
                >
                  <Text style={{ fontFamily: F.serif, fontSize: labelSize, lineHeight: labelSize + 3, color: tone.ink, textAlign: "center" }}>
                    {[...o.label].slice(0, chars).join("\n")}{o.label.length > chars ? "\n…" : ""}
                  </Text>
                  {won && <View style={{ position: "absolute", top: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: tone.ink }} />}
                </View>
              );
            })}
          </View>

          {/* 공 — 벽돌 구슬 + 하이라이트 */}
          {ready && (
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: C.brick, transform: [{ translateX: x }, { translateY: y }], shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}>
              <View style={{ position: "absolute", left: 3, top: 2.5, width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: "rgba(255,255,255,.65)" }} />
            </Animated.View>
          )}
        </View>
      </View>

      <Pressable
        onPress={drop}
        disabled={!ready || busy || dropping}
        accessibilityRole="button"
        style={{ marginTop: 16, height: 44, borderRadius: 22, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ready ? C.ink : "#a8a196" }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brick, borderWidth: 1.5, borderColor: REC.paper }} />
        <Text style={{ fontFamily: F.serif, fontSize: 14, color: REC.paper }}>{dropping ? "떨어지는 중…" : "공 넣기"}</Text>
      </Pressable>
    </View>
  );
}

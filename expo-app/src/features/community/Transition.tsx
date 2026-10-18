import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { getState } from "@/data/store";
import { C, F } from "@/theme";
import { K } from "./ui";

/**
 * 커뮤니티 들어가기 전환(핸드오프 §3 · 1d). 메인 탭바의 「커뮤니티」가 playCommunityTransition() 을 부르면
 * 루트 레이아웃 맨 위에 깔린 이 판이 올라와 화면을 덮고, 머무는 동안 아래에 /community 를 미리 띄운 뒤 위로 빠집니다.
 *   0–350 판이 페이드인 · 350–600 글자 · 600–1100 머묾(이때 push) · 1100–1500 판이 페이드아웃.
 * 누르면 바로 빠집니다. 나갈 때는 판이 없습니다.
 */
let play: (() => void) | null = null;
export const playCommunityTransition = () => play?.();

const T_IN = 350, T_TEXT = 250, T_HOLD_END = 1100, T_OUT = 400;

export default function CommunityTransition() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const fade = useSharedValue(0);
  const text = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pushed = useRef(false);
  const leaving = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));

  const push = () => {
    if (pushed.current) return;
    pushed.current = true;
    // 마지막에 본 커뮤니티 탭(처음엔 친구)으로 바로 엽니다.
    router.push(`/community/${getState().communityTab === ("recs" as string) ? "gallery" : getState().communityTab}`);
  };

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    clear();
    push();
    fade.value = withTiming(0, { duration: T_OUT });
    after(T_OUT, () => setOn(false));
  };

  useEffect(() => {
    play = () => {
      if (on) return;
      clear();
      pushed.current = false;
      leaving.current = false;
      setOn(true);
      fade.value = 0;
      text.value = 0;
      fade.value = withTiming(1, { duration: T_IN });
      after(T_IN, () => { text.value = withTiming(1, { duration: T_TEXT, easing: Easing.out(Easing.quad) }); });
      after(T_IN + T_TEXT, push);
      after(T_HOLD_END, leave);
    };
    return () => { play = null; };
  });

  useEffect(() => clear, []);

  const panel = useAnimatedStyle(() => ({ opacity: fade.value }));
  const words = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 8 }] }));

  if (!on) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.panel, panel]}>
      <Pressable style={s.fill} onPress={leave} accessibilityLabel="커뮤니티로 바로 가기">
        <Animated.View style={[s.words, words]}>
          <Text style={s.en}>COMMUNITY</Text>
          <Text style={s.ko}>커뮤니티</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: { zIndex: 1000, elevation: 1000, backgroundColor: K.ivory },
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  words: { alignItems: "center", gap: 10 },
  en: { fontFamily: F.mono, fontSize: 11, letterSpacing: 3, color: C.brick },
  ko: { fontFamily: F.serif, fontSize: 36, color: C.brick },
});

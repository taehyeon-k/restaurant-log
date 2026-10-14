import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "@/data/profile";
import { C, F } from "@/theme";
import { Star } from "./anim";
import type { RecapSummary } from "./compute";
import { parseQuarter, quarterRange, seasonOf, shiftQuarter } from "./seasons";
import { useRecapState, useRecaps } from "./useRecapState";

/**
 * 1a — 분기가 바뀐 뒤 처음 지도 탭이 보일 때 한 번만 띄우는 리캡 안내(HANDOFF quarterly recap §2·§3).
 * 띄우는 순간 prompted 를 남기므로 무엇을 누르든 다시 뜨지 않습니다. 촬영·모달·로그인 화면 위에서는
 * 지도 탭이 포커스를 잃어 기다립니다.
 */
export default function RecapInvite() {
  const focused = useIsFocused();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, latest } = useRecaps();
  const state = useRecapState();
  const { data: account } = useAccount();
  const [shown, setShown] = useState<RecapSummary | null>(null);

  useEffect(() => {
    if (!focused || !ready || !state.loaded || !latest || shown) return;
    if (state.prompted(latest.quarter)) return;
    state.markPrompted(latest.quarter);
    setShown(latest);
  }, [focused, ready, state, latest, shown]);

  const scrim = useSharedValue(0);
  const card = useSharedValue(0);
  useEffect(() => {
    if (!shown) return;
    scrim.value = withTiming(1, { duration: 200 });
    card.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  }, [shown, scrim, card]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: card.value, transform: [{ translateY: 24 * (1 - card.value) }] }));

  if (!shown) return null;
  const q = shown.quarter;
  const season = seasonOf(q);
  const { q: n } = parseQuarter(q)!;
  const { firstMonth, lastMonth } = quarterRange(q);
  const nextFirst = quarterRange(shiftQuarter(q, 1)).firstMonth;
  const nick = account?.nickname?.trim() || "나";

  const dismiss = () => setShown(null);
  const watch = () => {
    setShown(null);
    router.push({ pathname: "/recap/[quarter]", params: { quarter: q } });
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,26,23,.5)" }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="닫기" />
      </Animated.View>
      <Animated.View style={[s.card, { bottom: Math.max(28, insets.bottom + 8), backgroundColor: season.deep }, cardStyle]}>
        <View style={{ height: 300, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -110, top: -40 }}>
            <Star size={340} fill={season.accent} />
          </View>
          <View style={{ position: "absolute", left: 24, bottom: 22, gap: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 2.2, color: "#cdc6b8" }}>
              {nextFirst}월 1일 · {n}분기가 끝났어요
            </Text>
            <Text style={{ fontFamily: F.serif, fontSize: 40, lineHeight: 48, color: C.card }}>{`${nick}의\n${season.name} 식탁`}</Text>
          </View>
          <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="닫기" style={s.x}>
            <Text style={{ fontSize: 14, color: C.card }}>✕</Text>
          </Pressable>
        </View>
        <View style={{ paddingTop: 4, paddingHorizontal: 24, paddingBottom: 22, gap: 16 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 24, color: "#cdc6b8" }}>
            {firstMonth}월부터 {lastMonth}월까지 남긴 {shown.count}끼를 한 편으로 정리했어요. 1분이면 다 볼 수 있어요.
          </Text>
          <Pressable onPress={watch} style={({ pressed }) => [s.watch, { backgroundColor: season.accent }, pressed && { opacity: 0.85 }]}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 14.5, color: C.card }}>지금 보기</Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={6} style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: "#a29a8c" }}>나중에 · 캘린더 탭에서 다시 볼 수 있어요</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute", left: 14, right: 14, borderRadius: 32, overflow: "hidden",
    shadowColor: "#1c1a17", shadowOpacity: 0.4, shadowRadius: 60, shadowOffset: { width: 0, height: 24 }, elevation: 16,
  },
  x: {
    position: "absolute", top: 18, right: 18, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(251,250,246,.14)",
    alignItems: "center", justifyContent: "center",
  },
  watch: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});

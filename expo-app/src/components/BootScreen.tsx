import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Character } from "./Character";
import { Button } from "./ui";
import { DEFAULT_CHARACTER, type CharacterId } from "@/lib/characters";
import { C, F } from "@/theme";

import type { BootState } from "@/lib/reliability/boot";
export type { BootState };
const copy = {
  loading: "기록장을 펼치는 중이에요",
  slow: "연결이 느려요. 계속 불러오고 있어요",
  offline: "인터넷에 연결되어 있지 않아요",
  failed: "기록장을 불러오지 못했어요",
  done: "기록장을 펼치는 중이에요",
};
function Dot({ index, reduced }: { index: number; reduced: boolean }) {
  const opacity = useSharedValue(reduced ? 1 : 0.25);
  useEffect(() => {
    opacity.value = reduced ? 1 : withDelay(index * 180, withRepeat(withTiming(1, { duration: 450 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [index, opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}
export function BootScreen({ state, characterId = DEFAULT_CHARACTER, onRetry, onCapture, onHidden, fetching = false }: {
  state: BootState; characterId?: CharacterId; onRetry: () => void; onCapture?: () => void; onHidden: () => void; fetching?: boolean;
}) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    bob.value = reduced ? 0 : withRepeat(withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(bob);
  }, [bob, reduced]);
  useEffect(() => {
    if (state === "done") opacity.value = withTiming(0, { duration: reduced ? 0 : 250 }, (finished) => { if (finished) scheduleOnRN(onHidden); });
    else opacity.value = 1;
    return () => cancelAnimation(opacity);
  }, [state, opacity, onHidden, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const shadow = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 + bob.value / 60 }] }));
  const failed = state === "offline" || state === "failed";
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, fade]}>
      <SafeAreaView style={styles.center}>
        <View accessibilityRole="progressbar" accessibilityLabel={copy[state]} accessibilityLiveRegion="polite" style={styles.centered}>
          <Animated.View style={motion}><Character id={characterId} size={112} /></Animated.View>
          <Animated.View style={[styles.shadow, shadow]} />
          <Text style={styles.wordmark}>DINARY</Text>
          <Text style={[styles.status, failed && styles.failed]}>{copy[state]}</Text>
          {failed ? <Text style={styles.body}>{state === "failed" ? "인터넷 연결을 확인해 주세요. " : ""}연결되면 자동으로 다시 불러와요.</Text> : <View style={styles.dots}>{[0, 1, 2].map((i) => <Dot key={i} index={i} reduced={reduced} />)}</View>}
        </View>
        {failed && <>
          <Button kind="brick" label={fetching ? "불러오는 중…" : "다시 시도"} disabled={fetching} onPress={onRetry} style={{ width: 220, marginTop: 24 }} />
          {onCapture && <Button kind="line" label="지금 인증 사진 찍기" onPress={onCapture} style={{ width: 220, marginTop: 12 }} />}
        </>}
      </SafeAreaView>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  overlay: { backgroundColor: C.paper, zIndex: 999 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  centered: { alignItems: "center" },
  shadow: { width: 56, height: 8, borderRadius: 28, backgroundColor: C.lineSoft, marginTop: 10 },
  wordmark: { fontFamily: F.serif, fontSize: 34, color: C.ink, letterSpacing: 2, marginTop: 4 },
  status: { fontFamily: F.sans, fontSize: 13, color: C.muted, textAlign: "center", marginTop: 10 },
  failed: { fontFamily: F.sansBd, fontSize: 15, color: C.ink },
  body: { fontFamily: F.sans, fontSize: 13, color: C.muted, textAlign: "center", maxWidth: 260, marginTop: 6 },
  dots: { flexDirection: "row", gap: 8, marginTop: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brick },
});

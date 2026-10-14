import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useAccount } from "@/data/profile";
import { useRows, useWishes } from "@/data/queries";
import { A, CLOCK_END, ClockProvider } from "@/features/recap/anim";
import { computeRecap } from "@/features/recap/compute";
import { currentQuarter, parseQuarter, quarterLabel, seasonOf } from "@/features/recap/seasons";
import {
  Cover, Districts, Labels, Memo, Next, Numbers, Odd, Persona, ShareCard, Taste, Time, Top5, TopPlaceSlide, WishSlide,
  type Layout, type SlideProps,
} from "@/features/recap/slides";
import { useRecapState } from "@/features/recap/useRecapState";
import { C, F } from "@/theme";

/** 한 장이 머무는 시간(초) — 시제품 기본값. */
const SECONDS = 6;
/** 이보다 짧게 눌렀다 떼면 탭, 길면 멈춤 */
const TAP_MS = 250;
const NEEDS_BUILD = "새 개발 빌드가 필요해요";

/**
 * 공유 카드에만 쓰는 네이티브 모듈은 누를 때 불러옵니다 — expo-sharing 은 불러오는 순간 네이티브 모듈을 찾아서,
 * 이 모듈이 없는 예전 빌드에서는 위에서 import 하면 앱이 시작하자마자 멈춥니다. 없으면 null.
 */
function shareModules() {
  try {
    const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
    const Sharing = require("expo-sharing") as typeof import("expo-sharing");
    return { captureRef, Sharing };
  } catch {
    return null;
  }
}

/** view-shot 은 불러올 때가 아니라 부를 때 네이티브 모듈이 없다고 던집니다. */
const missingNative = (e: unknown) => e instanceof Error && /RNViewShot|native module/i.test(e.message);

type SlideDef = { id: string; dark: boolean; render: () => React.ReactNode };

/**
 * 분기 리캡 재생기 — HANDOFF quarterly recap §1. 스토리처럼 장마다 6초씩 넘어가고,
 * 오른쪽 70% 를 누르면 다음·왼쪽 30% 는 이전, 길게 누르면 멈춥니다. 데이터가 없는 장은 건너뜁니다.
 */
export default function RecapPlayer() {
  const { quarter = "" } = useLocalSearchParams<{ quarter: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { data: rows, dataUpdatedAt: rowsAt } = useRows();
  const { data: wishes, dataUpdatedAt: wishesAt } = useWishes();
  const { data: account } = useAccount();
  const recapState = useRecapState();

  const valid = !!parseQuarter(quarter) && quarter < currentQuarter();
  const { data: recap, isPending } = useQuery({
    queryKey: ["recap", quarter, rowsAt, wishesAt],
    queryFn: () => computeRecap(rows ?? [], wishes ?? [], quarter),
    enabled: valid && !!rows && !!wishes,
  });

  const season = valid ? seasonOf(quarter) : null;
  const nick = account?.nickname?.trim() || "나";
  const scale = Math.min(1, H / 844);
  const L: Layout = useMemo(
    () => ({ y: (mt: number) => Math.round(insets.top + Math.max(0, mt - 44) * scale), bottom: insets.bottom, scale }),
    [insets.top, insets.bottom, scale]
  );

  const cardRef = useRef<View>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const openRecord = useCallback((id: number) => router.replace({ pathname: "/record/[id]", params: { id: String(id) } }), [router]);
  const directions = useCallback((q: string) => { Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(q)}`).catch(() => {}); }, []);

  const [play, setPlay] = useState({ i: 0, n: 0 });

  const slides: SlideDef[] = useMemo(() => {
    if (!recap || !season) return [];
    const p: SlideProps = { data: recap, season, nick, L };
    const list: (SlideDef | null)[] = [
      { id: "cover", dark: true, render: () => <Cover {...p} /> },
      { id: "numbers", dark: false, render: () => <Numbers {...p} /> },
      recap.labels.earned.length || recap.labels.near.length ? { id: "labels", dark: false, render: () => <Labels {...p} /> } : null,
      { id: "top", dark: true, render: () => <TopPlaceSlide {...p} /> },
      recap.top5 ? { id: "top5", dark: false, render: () => <Top5 {...p} /> } : null,
      recap.districts ? { id: "districts", dark: true, render: () => <Districts {...p} /> } : null,
      { id: "taste", dark: false, render: () => <Taste {...p} /> },
      { id: "time", dark: true, render: () => <Time {...p} /> },
      { id: "persona", dark: false, render: () => <Persona {...p} /> },
      recap.memo ? { id: "memo", dark: true, render: () => <Memo {...p} onOpen={openRecord} /> } : null,
      recap.wish ? { id: "wish", dark: false, render: () => <WishSlide {...p} onDirections={directions} /> } : null,
      recap.odd ? { id: "odd", dark: false, render: () => <Odd {...p} /> } : null,
      recap.next ? { id: "next", dark: true, render: () => <Next {...p} /> } : null,
      { id: "share", dark: false, render: () => null },
    ];
    return list.filter((x): x is SlideDef => !!x);
  }, [recap, season, nick, L, openRecord, directions]);

  const last = slides.length - 1;
  const cur = Math.min(play.i, Math.max(0, last));

  /* ── 시계 · 진행 ─────────────────────────────── */

  const clock = useSharedValue(0);
  const prog = useSharedValue(0);

  const advance = useCallback(() => setPlay((p) => (p.i < last ? { i: p.i + 1, n: p.n + 1 } : p)), [last]);

  const run = useCallback(
    (fromClock: number, fromProg: number) => {
      clock.value = fromClock;
      clock.value = withTiming(CLOCK_END, { duration: Math.max(0, CLOCK_END - fromClock), easing: Easing.linear });
      prog.value = fromProg;
      prog.value = withTiming(1, { duration: Math.max(0, (1 - fromProg) * SECONDS * 1000), easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(advance);
      });
    },
    [clock, prog, advance]
  );

  const pause = () => {
    cancelAnimation(clock);
    cancelAnimation(prog);
  };
  const resume = () => run(clock.value, prog.value);

  // 장이 바뀔 때마다 처음부터 — 등장 애니메이션을 다시 틀고 진행 막대를 0 에서 채웁니다.
  useEffect(() => {
    if (!slides.length) return;
    run(0, 0);
    if (cur === last) recapState.markSeen(quarter);
    return () => {
      cancelAnimation(clock);
      cancelAnimation(prog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.n, slides.length]);

  const go = (i: number) => {
    if (i < 0) i = 0;
    if (i > last) return resume(); // 마지막 장에서 다음은 그대로 머뭅니다.
    Haptics.selectionAsync();
    setPlay((p) => ({ i, n: p.n + 1 }));
  };

  const downAt = useRef(0);
  const onPressIn = () => {
    downAt.current = Date.now();
    pause();
  };
  const onPressOut = (e: GestureResponderEvent) => {
    if (Date.now() - downAt.current < TAP_MS) go(e.nativeEvent.pageX < W * 0.3 ? cur - 1 : cur + 1);
    else resume();
  };

  /* ── 공유 카드 ─────────────────────────────── */

  async function shareCard() {
    const mods = shareModules();
    if (!mods) return setToast(NEEDS_BUILD);
    try {
      const uri = await mods.captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      if (!(await mods.Sharing.isAvailableAsync())) return setToast("이 기기에서는 공유할 수 없어요");
      await mods.Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "리캡 공유" });
    } catch (e) {
      setToast(missingNative(e) ? NEEDS_BUILD : "이미지를 만들지 못했어요");
    }
  }

  async function saveCard() {
    const mods = shareModules();
    if (!mods) return setToast(NEEDS_BUILD);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return setToast("사진 접근을 허용하면 저장할 수 있어요");
      await MediaLibrary.saveToLibraryAsync(await mods.captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast("사진 앱에 저장했어요");
    } catch (e) {
      setToast(missingNative(e) ? NEEDS_BUILD : "이미지를 저장하지 못했어요");
    }
  }

  /* ── 화면 ─────────────────────────────── */

  const close = () => router.back();

  if (!valid || (!isPending && !recap) || !season) {
    return (
      <View style={[s.root, { backgroundColor: C.paper, alignItems: "center", justifyContent: "center", padding: 28 }]}>
        <StatusBar style="dark" />
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, textAlign: "center" }}>이 분기의 리캡이 없어요</Text>
        <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 13, color: C.faint, textAlign: "center" }}>
          기록이 한 건도 없는 분기는 리캡이 만들어지지 않아요.
        </Text>
        <Pressable onPress={close} style={{ marginTop: 20, borderRadius: 20, backgroundColor: C.ink, paddingVertical: 12, paddingHorizontal: 22 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>닫기</Text>
        </Pressable>
      </View>
    );
  }

  if (!recap || !slides.length) return <View style={[s.root, { backgroundColor: season.deep }]} />;

  const slide = slides[cur];
  const chrome = slide.dark ? C.card : C.ink;
  const shareH = Math.max(380, Math.min(540, H - L.y(112) - (insets.bottom + 10) - 110 - 24));

  return (
    <ClockProvider value={clock}>
      <StatusBar style={slide.dark ? "light" : "dark"} />
      <Pressable style={s.root} onPressIn={onPressIn} onPressOut={onPressOut} accessible={false}>
        <View key={`${slide.id}-${play.n}`} style={StyleSheet.absoluteFill}>
          {slide.id === "share" ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#e9e5da" }]}>
              <A k="card" d={100} style={[{ position: "absolute", top: L.y(112), left: 30, right: 30 }, s.cardShadow]}>
                <View ref={cardRef} collapsable={false}>
                  <ShareCard data={recap} season={season} nick={nick} L={L} height={shareH} />
                </View>
              </A>
              <A k="up" d={600} style={{ position: "absolute", left: 30, right: 30, bottom: insets.bottom + 10, gap: 10 }}>
                <Pressable onPress={shareCard} style={({ pressed }) => [s.shareMain, pressed && { opacity: 0.85 }]}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>스토리에 공유</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable onPress={saveCard} style={({ pressed }) => [s.shareSub, pressed && { backgroundColor: "#f1ede4" }]}>
                    <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>이미지 저장</Text>
                  </Pressable>
                  <Pressable onPress={() => go(0)} style={({ pressed }) => [s.shareSub, pressed && { backgroundColor: "#f1ede4" }]}>
                    <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>처음부터 보기</Text>
                  </Pressable>
                </View>
              </A>
            </View>
          ) : (
            slide.render()
          )}
        </View>

        {/* 진행 막대 · DINARY · ✕ */}
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, gap: 12 }}>
          <View pointerEvents="none" style={{ flexDirection: "row", gap: 3 }}>
            {slides.map((sl, i) => (
              <Segment key={sl.id} state={i < cur ? "past" : i === cur ? "current" : "future"} prog={prog} color={chrome} />
            ))}
          </View>
          <View pointerEvents="box-none" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: chrome }}>DINARY · {quarterLabel(quarter)}</Text>
            <Pressable onPress={close} hitSlop={14} accessibilityLabel="리캡 닫기">
              <Text style={{ fontSize: 16, color: chrome }}>✕</Text>
            </Pressable>
          </View>
        </View>

        {toast && (
          <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 140 }]}>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.card }}>{toast}</Text>
          </View>
        )}
      </Pressable>
    </ClockProvider>
  );
}

function Segment({ state, prog, color }: { state: "past" | "current" | "future"; prog: SharedValue<number>; color: string }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === "past" ? 1 : state === "current" ? prog.value : 0) * 100}%`,
  }));
  return (
    <View style={{ flex: 1, height: 3 }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 2, backgroundColor: color, opacity: 0.25 }]} />
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: color }, fill]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  cardShadow: { shadowColor: "#1c1a17", shadowOpacity: 0.2, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 12, borderRadius: 26 },
  shareMain: { height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
  shareSub: {
    flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "#cdc6b8", backgroundColor: C.card, alignItems: "center", justifyContent: "center",
  },
  toast: {
    position: "absolute", alignSelf: "center", borderRadius: 16, backgroundColor: "rgba(23,22,20,.85)", paddingVertical: 10, paddingHorizontal: 16,
  },
});

import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, View, type ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { C, F } from "@/theme";

const ROW = 40;
const VISIBLE = 5;
const PAD = ROW * ((VISIBLE - 1) / 2);

/**
 * 다이얼 한 칸 — 위아래로 굴려 고르고, 가운데 줄이 고른 값입니다.
 * 손을 뗀 뒤 멈춘 칸으로만 onChange 를 부릅니다. 밖에서 index 가 바뀌면 그 칸으로 굴러갑니다.
 */
export function Wheel({
  items, index, onChange, width, label, mono,
}: {
  items: string[]; index: number; onChange: (i: number) => void;
  width?: number; label?: string; mono?: boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const y = useRef(new Animated.Value(index * ROW)).current;
  const live = useRef(index);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 밖에서 굴릴 때는 지나가는 칸마다 떨지 않습니다. */
  const quiet = useRef(false);

  useEffect(() => {
    if (live.current === index) return;
    live.current = index;
    quiet.current = true;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));
  const commit = (offset: number) => {
    const i = clamp(Math.round(offset / ROW));
    live.current = i;
    if (i !== index) onChange(i);
  };
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = clamp(Math.round(e.nativeEvent.contentOffset.y / ROW));
      if (i !== live.current) { live.current = i; if (!quiet.current) Haptics.selectionAsync(); }
    },
  });

  return (
    <View style={{ width, flex: width ? undefined : 1, height: ROW * VISIBLE }} accessibilityLabel={label} accessibilityValue={{ text: items[index] }}>
      <Animated.ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: PAD }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        // 천천히 놓으면 관성이 없어 momentum 이벤트가 오지 않습니다 — 잠깐 기다렸다 고릅니다.
        onScrollBeginDrag={() => { quiet.current = false; }}
        onScrollEndDrag={(e) => {
          const off = e.nativeEvent.contentOffset.y;
          settle.current = setTimeout(() => commit(off), Platform.OS === "ios" ? 60 : 120);
        }}
        onMomentumScrollBegin={() => { if (settle.current) clearTimeout(settle.current); }}
        onMomentumScrollEnd={(e) => commit(e.nativeEvent.contentOffset.y)}
      >
        {items.map((t, i) => {
          const at = i * ROW;
          const dist = [at - ROW * 2, at - ROW, at, at + ROW, at + ROW * 2];
          return (
            <Pressable key={`${i}-${t}`} onPress={() => { if (i !== index) { Haptics.selectionAsync(); onChange(i); } }} style={{ height: ROW, justifyContent: "center", alignItems: "center" }}>
              <Animated.Text
                numberOfLines={1}
                style={{
                  fontFamily: mono ? F.mono : F.sansMd,
                  fontSize: 16,
                  color: C.ink,
                  opacity: y.interpolate({ inputRange: dist, outputRange: [0.18, 0.4, 1, 0.4, 0.18], extrapolate: "clamp" }),
                  transform: [{ scale: y.interpolate({ inputRange: dist, outputRange: [0.86, 0.93, 1, 0.93, 0.86], extrapolate: "clamp" }) }],
                }}
              >
                {t}
              </Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

/** 다이얼 여러 칸을 나란히 — 가운데 줄에 옅은 띠를 깝니다. */
export function WheelRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ height: ROW * VISIBLE, flexDirection: "row", alignItems: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: PAD, height: ROW, borderRadius: 12, backgroundColor: C.brickSoft }} />
      {children}
    </View>
  );
}

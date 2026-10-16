import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { PaperMap } from "@/components/PaperMap";
import { setState, type RecHere } from "@/data/store";
import { formatDistance } from "@/lib/distance";
import { NEAR_MAX_M, pickNow, type Pick, type PlaceStat, type RecCategory, type RecFilter } from "@/lib/recommend";
import type { Restaurant, Wish } from "@/lib/types";
import { C, F } from "@/theme";
import { openDirections } from "./api";
import { HereLegend, HereMarker, KakaoLink, NumberMarker, REC } from "./ui";

const MAP_H = 270;
/** 이만큼 끌면 다음 장(§5-3). */
const SWIPE_PX = 50;

/** 지름 radius·2 를 담는 지도 영역 — Region 은 남서쪽 모서리 + 폭입니다. */
function regionAround(lat: number, lng: number, radius: number) {
  const dLat = ((radius * 2.5) / 111320);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return { latitude: lat - dLat / 2, longitude: lng - dLng / 2, latitudeDelta: dLat, longitudeDelta: dLng };
}

/**
 * 「지금 뭐 먹지」(§5, 시안 5a) — 필터 줄 + 카드 한 장(위 지도 · 아래 가게 설명 가로 슬라이드).
 * 후보는 2km 안, 가까운 곳 위주로 — 최근 4주 같은 요일 · 시간대에 인증이 있는 곳 — 5곳이 안 차면 요일 조건을 빼고, 그래도 없으면 빈 상태.
 */
export function NowMode({
  here, stats, loading, wishes, rows, filter, yesterday, couple, onOpenFilter, onChangeFilter,
}: {
  here: RecHere | null; stats: PlaceStat[]; loading: boolean; wishes: Wish[]; rows: Restaurant[];
  filter: RecFilter; yesterday: RecCategory[]; couple: boolean;
  onOpenFilter: () => void; onChangeFilter: (f: RecFilter) => void;
}) {
  const { picks, anyDay } = useMemo(
    () => (here ? pickNow({ stats, wishes, rows, filter, yesterday, couple }) : { picks: [] as Pick[], anyDay: false }),
    [here, stats, wishes, rows, filter, yesterday, couple]
  );

  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [picks]);

  const count = filter.inc.length + filter.exc.length;
  const chip = (key: string, text: string, kind: "inc" | "exc", onRemove: () => void) => (
    <Pressable
      key={key}
      onPress={onRemove}
      accessibilityLabel={`${text} 해제`}
      style={{
        height: 36, borderRadius: 18, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 6,
        borderWidth: 1, borderColor: kind === "inc" ? REC.ink : REC.excBg,
        backgroundColor: kind === "exc" ? REC.excBg : REC.paper,
      }}
    >
      <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: kind === "exc" ? REC.excInk : C.ink }}>{text}</Text>
      <Text style={{ fontSize: 11, color: kind === "exc" ? REC.excInk : C.faint }}>✕</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* 필터 줄 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 6 }}>
        <Pressable onPress={onOpenFilter} accessibilityRole="button" style={{ height: 36, borderRadius: 18, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: REC.ink }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: REC.paper }}>필터</Text>
          {count > 0 && <Text style={{ fontFamily: F.mono, fontSize: 11, color: REC.accent }}>{count}</Text>}
        </Pressable>
        {filter.inc.map((c) => chip(`i${c}`, c, "inc", () => onChangeFilter({ ...filter, inc: filter.inc.filter((x) => x !== c) })))}
        {filter.exc.map((c) => chip(`e${c}`, `${c} 빼기`, "exc", () => onChangeFilter({ ...filter, exc: filter.exc.filter((x) => x !== c) })))}
      </ScrollView>

      <View style={{ flex: 1, marginTop: 12, minHeight: MAP_H + 190, borderRadius: 24, borderWidth: 1.5, borderColor: C.brick, backgroundColor: REC.paper, overflow: "hidden" }}>
        {!here || (loading && !stats.length) ? (
          <Empty>{here ? <ActivityIndicator color={C.brick} /> : <Text style={emptyText}>지금 있는 곳을 찾는 중이에요…</Text>}</Empty>
        ) : picks.length === 0 ? (
          <Empty>
            <Text style={emptyText}>
              {`${formatDistance(NEAR_MAX_M)} 안에서 최근 4주 이 시간대에 인증된 곳을 아직 못 찾았어요.\n인증 기록이 쌓이면 이 동네도 추천해 드릴게요.`}
            </Text>
            <Pressable onPress={onOpenFilter} style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.brick }}>필터 바꾸기</Text>
            </Pressable>
          </Empty>
        ) : (
          <>
            <PickMap here={here} picks={picks} index={index} onPick={setIndex} />
            {anyDay && (
              <Text style={{ marginTop: 8, marginHorizontal: 18, fontFamily: F.sans, fontSize: 11, color: C.faint }}>같은 요일 기록이 적어 요일 상관없이 이 시간대로 골랐어요</Text>
            )}
            <Pager picks={picks} index={index} onIndex={setIndex} />
          </>
        )}
      </View>
    </View>
  );
}

const emptyText = { fontFamily: F.sans, fontSize: 12.5, lineHeight: 20, color: C.faint, textAlign: "center" } as const;
const Empty = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</View>
);

/** 위: 지도(높이 270) — 내 위치 · 번호 마커. 가장 먼 후보까지 담고, 상호작용은 끕니다. */
function PickMap({ here, picks, index, onPick }: { here: RecHere; picks: Pick[]; index: number; onPick: (i: number) => void }) {
  const radius = Math.max(250, ...picks.map((p) => p.distance)) * 1.1;
  const region = useMemo(() => regionAround(here.lat, here.lng, radius), [here.lat, here.lng, radius]);
  return (
    <View style={{ height: MAP_H, borderBottomWidth: 1, borderColor: C.lineSoft }}>
      <PaperMap
        region={region}
        isScrollGesturesEnabled={false}
        isZoomGesturesEnabled={false}
        isRotateGesturesEnabled={false}
        isTiltGesturesEnabled={false}
        isShowIndoorLevelPicker={false}
      >
        <HereMarker lat={here.lat} lng={here.lng} />
        {picks.map((p, i) => (
          <NumberMarker key={p.key} lat={p.lat} lng={p.lng} n={i + 1} name={p.name} active={i === index} onTap={() => onPick(i)} />
        ))}
      </PaperMap>
      <HereLegend />
    </View>
  );
}

/** 아래: 가게 설명 — 좌우로 50px 넘게 끌면 다음 장. */
function Pager({ picks, index, onIndex }: { picks: Pick[]; index: number; onIndex: (i: number) => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const live = useRef({ index, w, n: picks.length });
  live.current = { index, w, n: picks.length };

  useEffect(() => {
    Animated.spring(x, { toValue: -index * w, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [index, w, x]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        // 세로 스크롤이 가로 넘김을 가로채지 않게.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => x.setValue(-live.current.index * live.current.w + g.dx),
        onPanResponderRelease: (_, g) => {
          const { index: i, n, w: width } = live.current;
          const next = g.dx <= -SWIPE_PX ? Math.min(n - 1, i + 1) : g.dx >= SWIPE_PX ? Math.max(0, i - 1) : i;
          if (next !== i) { Haptics.selectionAsync(); onIndex(next); }
          else Animated.spring(x, { toValue: -i * width, useNativeDriver: true, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: -live.current.index * live.current.w, useNativeDriver: true }).start(),
      }),
    [x, onIndex]
  );

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={{ flexDirection: "row", width: w * picks.length, flex: 1, transform: [{ translateX: x }] }}>
          {picks.map((p, i) => <PickPage key={p.key} p={p} n={i + 1} width={w} />)}
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 5, paddingBottom: 14 }}>
        {picks.map((p, i) => (
          <Pressable key={p.key} onPress={() => onIndex(i)} hitSlop={6} accessibilityLabel={`${i + 1}번째 가게`}>
            <View style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? C.brick : REC.dot }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PickPage({ p, n, width }: { p: Pick; n: number; width: number }) {
  const go = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState({ recHeading: { placeKey: p.key, name: p.name, lat: p.lat, lng: p.lng, at: Date.now() } });
    openDirections(p);
  };
  const sub = [p.recCat ?? p.category, formatDistance(p.distance)].filter(Boolean).join(" · ");
  return (
    <View style={{ width, paddingHorizontal: 18, paddingTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: "#ffffff" }}>{n}</Text>
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{p.name}</Text>
        <Pressable onPress={go} accessibilityRole="button" style={{ height: 34, borderRadius: 17, backgroundColor: C.brick, paddingHorizontal: 13, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>여기로 갈게요</Text>
        </Pressable>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.muted }}>{sub}</Text>
      {!!p.placeUrl && <KakaoLink url={p.placeUrl} />}
      <View style={{ marginTop: 12, gap: 7 }}>
        {p.reasons.map((r, i) => (
          <View key={r} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 19, color: C.brick }}>{i + 1}</Text>
            <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: C.ink }}>{r}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

import * as Haptics from "expo-haptics";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { PaperMap } from "@/components/PaperMap";
import { setState, type RecHere } from "@/data/store";
import { formatDistance } from "@/lib/distance";
import { REC_CONFIG } from "@/lib/rec/config";
import type { RecResult, Relax } from "@/lib/rec/pipeline";
import type { Scored } from "@/lib/rec/score";
import type { MealSlot } from "@/lib/rec/time";
import type { RecFilter } from "@/lib/recommend";
import { C, F } from "@/theme";
import { openDirections } from "./api";
import { logRec, rememberShown, type RecSession } from "./log";
import { HereLegend, HereMarker, NumberMarker, REC } from "./ui";

const MAP_H = 270;
/** 이만큼 끌면 다음 장(§5-3). */
const SWIPE_PX = 50;
/** 카드가 이만큼 머물러야 「보였다」(impression)로 셉니다. */
const DWELL_MS = 700;

/** 지름 radius·2 를 담는 지도 영역 — Region 은 남서쪽 모서리 + 폭입니다. */
function regionAround(lat: number, lng: number, radius: number) {
  const dLat = ((radius * 2.5) / 111320);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return { latitude: lat - dLat / 2, longitude: lng - dLng / 2, latitudeDelta: dLat, longitudeDelta: dLng };
}

/**
 * 「지금 뭐 먹지」(§5, 시안 5a) — 필터 줄 + 카드 한 장(위 지도 · 아래 가게 설명 가로 슬라이드).
 * 5곳은 lib/rec/pipeline.ts(hybrid-v3)가 고릅니다: 둘레 후보 → 취향 · 거리 · 시간대 · 위시 · 새로움 점수 → MMR 다양성.
 * 「다시 추천」은 앞서 보여 준 곳을 빼고 다음으로 좋은 5곳을 고릅니다.
 */
export function NowMode({
  here, result, session, loading, error, kakao, filter, slot, pointLabel, onMapTouch, onOpenFilter, onChangeFilter, onRefresh, onMeal, onRetry,
}: {
  here: RecHere | null; result: RecResult | null; session: RecSession | null; loading: boolean; error: boolean;
  /** 카카오 후보를 받았는지 — unavailable 이면 Dinary 기록 · 위시만으로 고른 것. */
  kakao: "ok" | "partial" | "unavailable" | "loading";
  filter: RecFilter; slot: MealSlot; pointLabel: string;
  /** 지도를 만지기 시작 · 끝 — 부모가 세로 스크롤을 잠급니다. */
  onMapTouch: (touching: boolean) => void;
  onOpenFilter: () => void; onChangeFilter: (f: RecFilter) => void;
  onRefresh: () => void; onMeal: (slot: "lunch" | "dinner") => void; onRetry: () => void;
}) {
  const picks = result?.picks ?? [];
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [session?.id]);

  // 보인 카드만 impression — 탭이 앞에 있고, 그 카드가 DWELL_MS 넘게 머물렀을 때.
  const focused = useIsFocused();
  useEffect(() => {
    if (!session || !focused || !picks[index]) return;
    const t = setTimeout(() => {
      void logRec(session, "impression", { key: picks[index].c.key, position: index + 1 });
      rememberShown(session, index + 1);
    }, DWELL_MS);
    return () => clearTimeout(t);
  }, [session, focused, index, picks]);

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
  const meal = (m: "lunch" | "dinner", label: string) => {
    const on = slot === m;
    return (
      <Pressable
        key={m}
        onPress={() => { Haptics.selectionAsync(); onMeal(m); }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label} 기준으로 보기`}
        style={{ height: 36, borderRadius: 18, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderColor: on ? REC.ink : C.lineSoft, backgroundColor: on ? REC.ink : REC.paper }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: on ? REC.paper : C.ink }}>{label}</Text>
      </Pressable>
    );
  };

  const note = result ? noteLine(result.relax, result.cycled, kakao) : "";

  return (
    <View style={{ flex: 1 }}>
      {/* 필터 줄 — 필터 · 점심/저녁 · 고른 조건 칩 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 6 }}>
        <Pressable onPress={onOpenFilter} accessibilityRole="button" style={{ height: 36, borderRadius: 18, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: REC.ink }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: REC.paper }}>필터</Text>
          {count > 0 && <Text style={{ fontFamily: F.mono, fontSize: 11, color: REC.accent }}>{count}</Text>}
        </Pressable>
        {meal("lunch", "점심")}
        {meal("dinner", "저녁")}
        {filter.inc.map((c) => chip(`i${c}`, c, "inc", () => onChangeFilter({ ...filter, inc: filter.inc.filter((x) => x !== c) })))}
        {filter.exc.map((c) => chip(`e${c}`, `${c} 빼기`, "exc", () => onChangeFilter({ ...filter, exc: filter.exc.filter((x) => x !== c) })))}
      </ScrollView>

      <View style={{ flex: 1, marginTop: 12, minHeight: MAP_H + 230, borderRadius: 24, borderWidth: 1.5, borderColor: C.brick, backgroundColor: REC.paper, overflow: "hidden" }}>
        {!here || loading ? (
          <Empty>{here ? <ActivityIndicator color={C.brick} /> : <Text style={emptyText}>지금 있는 곳을 찾는 중이에요…</Text>}</Empty>
        ) : error && !picks.length ? (
          <Empty>
            <Text style={emptyText}>추천할 곳을 불러오지 못했어요.</Text>
            <Pressable onPress={onRetry} style={{ marginTop: 10 }} accessibilityRole="button">
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.brick }}>다시 시도하기</Text>
            </Pressable>
          </Empty>
        ) : picks.length === 0 ? (
          <Empty>
            <Text style={emptyText}>
              {`${formatDistance(REC_CONFIG.mineRadius)} 안에서 조건에 맞는 곳을 아직 못 찾았어요.\n필터를 풀거나 위시리스트에 담아 두면 여기서 골라 드릴게요.`}
            </Text>
            <Pressable onPress={onOpenFilter} style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.brick }}>필터 바꾸기</Text>
            </Pressable>
          </Empty>
        ) : (
          <>
            <PickMap here={here} picks={picks} index={index} onPick={setIndex} pointLabel={pointLabel} onTouch={onMapTouch} />
            {!!note && <Text style={{ marginTop: 8, marginHorizontal: 18, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{note}</Text>}
            <Pager picks={picks} index={index} onIndex={setIndex} session={session} />
          </>
        )}
      </View>

      {picks.length > 0 && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); if (session) void logRec(session, "refresh", { payload: { shown: picks.length } }); onRefresh(); }}
          accessibilityRole="button"
          accessibilityLabel="다른 다섯 곳 추천받기"
          style={{ marginTop: 12, alignSelf: "center", height: 40, borderRadius: 20, borderWidth: 1, borderColor: REC.chipLine, backgroundColor: REC.paper, paddingHorizontal: 18, justifyContent: "center" }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick }}>다시 추천</Text>
        </Pressable>
      )}
      {picks.length > 0 && (
        <Text style={{ marginTop: 10, textAlign: "center", fontFamily: F.sans, fontSize: 10.5, lineHeight: 16, color: C.faint }}>
          거리는 직선거리예요. 영업시간 · 메뉴는 가기 전에 카카오맵에서 확인해 주세요.
        </Text>
      )}
    </View>
  );
}

/** 카드 위 안내 한 줄 — 푼 조건 · 다시 쓴 곳 · 후보 출처. */
function noteLine(r: Relax, cycled: boolean, kakao: "ok" | "partial" | "unavailable" | "loading") {
  const lines = [
    r.kind === "wider" ? `가까운 곳이 적어 ${formatDistance(r.radius)}까지 넓혀 찾았어요` : r.kind === "mine" ? "근처 후보가 적어 내 위시리스트 · 다시 간 곳으로 채웠어요" : "",
    cycled ? "새로 고를 곳이 모자라 앞서 본 곳도 다시 넣었어요" : "",
    kakao === "unavailable" ? "주변 가게 검색이 잠시 안 돼 Dinary 기록으로만 골랐어요" : "",
  ];
  return lines.filter(Boolean).join(" · ");
}

const emptyText = { fontFamily: F.sans, fontSize: 12.5, lineHeight: 20, color: C.faint, textAlign: "center" } as const;
const Empty = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</View>
);

/** 위: 지도(높이 270) — 기준 위치 · 번호 마커. 처음엔 가장 먼 후보까지 담고, 끌기 · 확대 · 축소가 됩니다. */
function PickMap({
  here, picks, index, onPick, pointLabel, onTouch,
}: { here: RecHere; picks: Scored[]; index: number; onPick: (i: number) => void; pointLabel: string; onTouch: (touching: boolean) => void }) {
  const radius = Math.max(250, ...picks.map((p) => p.c.distance)) * 1.1;
  const region = useMemo(() => regionAround(here.lat, here.lng, radius), [here.lat, here.lng, radius]);
  return (
    <View
      style={{ height: MAP_H, borderBottomWidth: 1, borderColor: C.lineSoft }}
      onTouchStart={() => onTouch(true)}
      onTouchEnd={() => onTouch(false)}
      onTouchCancel={() => onTouch(false)}
    >
      <PaperMap
        region={region}
        isRotateGesturesEnabled={false}
        isTiltGesturesEnabled={false}
        isShowIndoorLevelPicker={false}
      >
        <HereMarker lat={here.lat} lng={here.lng} />
        {picks.map((p, i) => (
          <NumberMarker key={p.c.key} lat={p.c.lat} lng={p.c.lng} n={i + 1} name={p.c.name} active={i === index} onTap={() => onPick(i)} />
        ))}
      </PaperMap>
      <HereLegend label={pointLabel} />
    </View>
  );
}

/** 아래: 가게 설명 — 좌우로 50px 넘게 끌면 다음 장. */
function Pager({ picks, index, onIndex, session }: { picks: Scored[]; index: number; onIndex: (i: number) => void; session: RecSession | null }) {
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
          {picks.map((p, i) => <PickPage key={p.c.key} p={p} n={i + 1} width={w} session={session} />)}
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 5, paddingBottom: 14 }}>
        {picks.map((p, i) => (
          <Pressable key={p.c.key} onPress={() => onIndex(i)} hitSlop={6} accessibilityLabel={`${i + 1}번째 가게`}>
            <View style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? C.brick : REC.dot }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const placeKeyOf = (p: Scored) => {
  const r = p.c.visits[0];
  return r ? r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase() : null;
};

function PickPage({ p, n, width, session }: { p: Scored; n: number; width: number; session: RecSession | null }) {
  const router = useRouter();
  const log = (type: Parameters<typeof logRec>[1], payload?: Record<string, unknown>) => {
    if (session) void logRec(session, type, { key: p.c.key, position: n, payload });
  };
  const go = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    log("navigate");
    setState({ recHeading: { placeKey: p.c.key, name: p.c.name, lat: p.c.lat, lng: p.c.lng, at: Date.now(), sessionId: session?.id } });
    openDirections(p.c);
  };
  const kakaoUrl = p.c.placeUrl ?? (p.c.kakaoId ? `https://place.map.kakao.com/${p.c.kakaoId}` : null);
  const mine = placeKeyOf(p);
  const sub = [p.c.cat.recCat ?? p.c.cat.sub ?? "식당", formatDistance(p.c.distance)].join(" · ");

  const link = (label: string, onPress: () => void, tone: "muted" | "brick" = "muted") => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }} style={{ minHeight: 20, justifyContent: "center" }}>
      <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: tone === "brick" ? C.brick : REC.label }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ width, paddingHorizontal: 18, paddingTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: "#ffffff" }}>{n}</Text>
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{p.c.name}</Text>
        <Pressable onPress={go} accessibilityRole="button" style={{ height: 34, borderRadius: 17, backgroundColor: C.brick, paddingHorizontal: 13, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>여기로 갈게요</Text>
        </Pressable>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.muted }}>{sub}</Text>

      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4 }}>
        {!!kakaoUrl && link("카카오맵에서 보기", () => { log("kakao_open"); Linking.openURL(kakaoUrl).catch(() => {}); })}
        {!!mine && link("내 기록 보기", () => { log("detail_open", { target: "place" }); router.push({ pathname: "/place/[key]", params: { key: mine } }); })}
        {p.c.wish
          ? link("위시에 담김 ✓", () => router.push({ pathname: "/wish/[id]", params: { id: p.c.wish!.id } }), "brick")
          : link("+ 위시에 담기", () => {
              log("wish_start");
              router.push({
                pathname: "/wish/new",
                params: {
                  name: p.c.name, where_text: p.c.address ?? "", category: p.c.cat.base ?? "", lat: String(p.c.lat), lng: String(p.c.lng),
                  ...(session ? { rec_session: session.id, rec_key: p.c.key, rec_pos: String(n) } : {}),
                },
              });
            }, "brick")}
      </View>

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

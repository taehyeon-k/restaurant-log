import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { MapPinIcon } from "@/components/icons";
import { useActiveBook } from "@/data/books";
import { useRows, useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import { useMyTours, useRecCourses, useRecHere, useRecPlaces } from "@/features/recommend/api";
import { BrowseMode } from "@/features/recommend/BrowseMode";
import { FilterSheet } from "@/features/recommend/FilterSheet";
import { NowMode } from "@/features/recommend/NowMode";
import { PointSheet } from "@/features/recommend/PointSheet";
import { REC } from "@/features/recommend/ui";
import { todayIso } from "@/lib/anniversary";
import { defaultFilter, FETCH_MAX_M, recentExclude, REC_MODE_LABEL, type RecFilter, type RecMode } from "@/lib/recommend";
import { C, F, TAB_BAR_H } from "@/theme";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
/** 「토 15:02」 — 오늘이 아니면 「토 10.18 15:00」. */
const whenLabel = (d: Date, today: Date) =>
  `${DAYS[d.getDay()]}${d.toDateString() === today.toDateString() ? "" : ` ${d.getMonth() + 1}.${d.getDate()}`} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 「지금 뭐 먹지」는 10km 안을 한 번에 받아 두고, 2km 안 가까운 곳부터 고르며 모자라면 넓힙니다. */
const NOW_FETCH_M = FETCH_MAX_M;
/** 「다시 가는 사람이 많은 곳」 둘레. */
const BROWSE_M = 3000;

/**
 * 추천 탭(HANDOFF-recommend-all §4, 시안 v2 5a–5b) — 한 화면 안에서 「지금 뭐 먹지 / 둘러보기」를 오갑니다.
 * 남의 기록은 서버가 숫자로만 돌려주고(사진 · 사람 없음), 셈에는 인증된 기록만 씁니다.
 */
export default function RecommendTab() {
  const insets = useSafeAreaInsets();
  const { isCouple } = useActiveBook();
  const { data: rows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { recFilter, recPlace, recAt } = useAppState();
  const today = todayIso();

  const [mode, setMode] = useState<RecMode>("now");
  const [sheet, setSheet] = useState(false);
  const [pointSheet, setPointSheet] = useState(false);
  // 지도를 만지는 동안은 화면 세로 스크롤을 멈춥니다 — 지도 끌기 · 확대가 스크롤에 먹히지 않게.
  const [mapTouch, setMapTouch] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 기준 = 머리에서 고른 자리 · 시각, 없으면 지금 위치 · 지금 시각.
  const { here: gps, denied } = useRecHere(rows);
  const here = recPlace ?? gps;
  const at = recAt;
  const custom = !!recPlace || !!recAt;
  const nowQ = useRecPlaces(here, NOW_FETCH_M, at);
  const browseQ = useRecPlaces(mode === "browse" ? here : null, BROWSE_M);
  const { data: courses = [] } = useRecCourses(mode === "browse" ? here : null, at);
  const { data: tours = [] } = useMyTours();

  // 필터 — 기본은 최근 3일 먹은 종류 빼기. 바꾼 값은 그 날만.
  const defaults = useMemo(() => defaultFilter(rows, today), [rows, today]);
  const yesterday = useMemo(() => recentExclude(rows, today).yesterday, [rows, today]);
  const filter: RecFilter = useMemo(
    () => (recFilter?.date === today ? { inc: recFilter.inc, exc: recFilter.exc } : defaults),
    [recFilter, today, defaults]
  );
  const applyFilter = (f: RecFilter) => {
    setState({ recFilter: { ...f, date: today } });
    setSheet(false);
  };

  const revisits = useMemo(() => (browseQ.data ?? []).filter((s) => s.kind === "restaurant").slice(0, 10), [browseQ.data]);

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 22 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: REC.label }}>RECOMMEND</Text>
          <Pressable
            onPress={() => setPointSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="추천 기준 위치 · 시각 바꾸기"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 13, paddingHorizontal: custom ? 9 : 0, paddingVertical: custom ? 4 : 0, backgroundColor: custom ? C.brickSoft : "transparent" }}
          >
            <MapPinIcon size={12} stroke={C.brick} strokeWidth={2} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sans, fontSize: 11, color: custom ? C.brick : C.muted }}>
              {[here?.name, whenLabel(at ? new Date(at) : clock, clock)].filter(Boolean).join(" · ")}
            </Text>
            <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={custom ? C.brick : C.muted} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          </Pressable>
        </View>
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "baseline", gap: 14 }}>
          {(Object.keys(REC_MODE_LABEL) as RecMode[]).map((m) => (
            <ModeTitle key={m} label={REC_MODE_LABEL[m]} on={mode === m} onPress={() => { Haptics.selectionAsync(); setMode(m); }} />
          ))}
        </View>
        {denied && !recPlace && here?.fallback && (
          <Pressable onPress={() => Linking.openSettings()} style={{ marginTop: 10, borderRadius: 14, backgroundColor: REC.noteBg, paddingVertical: 9, paddingHorizontal: 12 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: REC.noteInk }}>
              위치 권한이 없어 자주 기록한 {here.name} 기준으로 골랐어요. 설정에서 위치를 허용하면 지금 있는 곳 둘레로 찾아요 ›
            </Text>
          </Pressable>
        )}
        {denied && !recPlace && !here && (
          <Pressable onPress={() => Linking.openSettings()} style={{ marginTop: 10, borderRadius: 14, backgroundColor: REC.noteBg, paddingVertical: 9, paddingHorizontal: 12 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: REC.noteInk }}>
              위치 권한이 필요해요. 설정에서 위치를 허용해 주세요 ›
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 14, paddingHorizontal: 22, paddingBottom: TAB_BAR_H + insets.bottom + 18 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!mapTouch}
      >
        {mode === "now" ? (
          <NowMode
            here={here}
            stats={nowQ.data ?? []}
            loading={nowQ.isLoading}
            wishes={wishes}
            rows={rows}
            filter={filter}
            yesterday={yesterday}
            couple={isCouple}
            at={at}
            pointLabel={recPlace ? "고른 위치" : "내 위치"}
            onMapTouch={setMapTouch}
            onOpenFilter={() => setSheet(true)}
            onChangeFilter={(f) => setState({ recFilter: { ...f, date: today } })}
          />
        ) : (
          <BrowseMode courses={courses} tours={tours} revisits={revisits} />
        )}
      </ScrollView>

      <PointSheet
        visible={pointSheet}
        gps={gps}
        place={recPlace}
        at={recAt}
        onClose={() => setPointSheet(false)}
        onApply={(place, when) => { setState({ recPlace: place, recAt: when }); setPointSheet(false); }}
      />
      <FilterSheet visible={sheet} value={filter} defaults={defaults} onClose={() => setSheet(false)} onApply={applyFilter} />
    </View>
  );
}

/** 모드 이름 — 고른 쪽은 Gowun Batang 28 진하게, 아닌 쪽은 16 연하게. 제자리에서 0.3s 로 커지고 작아집니다(§4-1-1). */
function ModeTitle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: on ? 1 : 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start();
  }, [on, t]);
  return (
    <Pressable onPress={onPress} disabled={on} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={8}>
      <Animated.Text
        style={{
          fontFamily: F.serif,
          fontSize: t.interpolate({ inputRange: [0, 1], outputRange: [16, 28] }),
          color: t.interpolate({ inputRange: [0, 1], outputRange: [REC.quiet, REC.ink] }),
        }}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

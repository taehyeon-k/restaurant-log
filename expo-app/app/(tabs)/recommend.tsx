import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPinIcon } from "@/components/icons";
import { useActiveBook } from "@/data/books";
import { useRows, useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import { useMyTours, useRecCourses, useRecHere, useRecPlaces } from "@/features/recommend/api";
import { BrowseMode } from "@/features/recommend/BrowseMode";
import { FilterSheet } from "@/features/recommend/FilterSheet";
import { NowMode } from "@/features/recommend/NowMode";
import { REC } from "@/features/recommend/ui";
import { todayIso } from "@/lib/anniversary";
import { defaultFilter, DISTS, normalizeDist, recentExclude, REC_MODE_LABEL, type RecFilter, type RecMode } from "@/lib/recommend";
import { C, F, TAB_BAR_H } from "@/theme";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const nowLabel = (d: Date) => `${DAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 「지금 뭐 먹지」는 가장 넓은 거리(2km)까지 한 번에 받아 두고 앱에서 필터 거리로 좁힙니다. */
const NOW_FETCH_M = DISTS[DISTS.length - 1];
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
  const { recFilter } = useAppState();
  const today = todayIso();

  const [mode, setMode] = useState<RecMode>("now");
  const [sheet, setSheet] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { here, denied } = useRecHere(rows);
  const nowQ = useRecPlaces(here, NOW_FETCH_M);
  const browseQ = useRecPlaces(mode === "browse" ? here : null, BROWSE_M);
  const { data: courses = [] } = useRecCourses(mode === "browse" ? here : null);
  const { data: tours = [] } = useMyTours();

  // 필터 — 기본은 최근 3일 먹은 종류 빼기 · 1km. 바꾼 값은 그 날만(옛 분 단위 거리는 1km 로).
  const defaults = useMemo(() => defaultFilter(rows, today), [rows, today]);
  const yesterday = useMemo(() => recentExclude(rows, today).yesterday, [rows, today]);
  const filter: RecFilter = useMemo(
    () => (recFilter?.date === today ? { ...recFilter, dist: normalizeDist(recFilter.dist) } : defaults),
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
          <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPinIcon size={12} stroke={C.brick} strokeWidth={2} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sans, fontSize: 11, color: C.muted }}>
              {[here?.name, nowLabel(clock)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "baseline", gap: 14 }}>
          {(Object.keys(REC_MODE_LABEL) as RecMode[]).map((m) => (
            <ModeTitle key={m} label={REC_MODE_LABEL[m]} on={mode === m} onPress={() => { Haptics.selectionAsync(); setMode(m); }} />
          ))}
        </View>
        {denied && here?.fallback && (
          <Pressable onPress={() => Linking.openSettings()} style={{ marginTop: 10, borderRadius: 14, backgroundColor: REC.noteBg, paddingVertical: 9, paddingHorizontal: 12 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: REC.noteInk }}>
              위치 권한이 없어 자주 기록한 {here.name} 기준으로 골랐어요. 설정에서 위치를 허용하면 지금 있는 곳 둘레로 찾아요 ›
            </Text>
          </Pressable>
        )}
        {denied && !here && (
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
            onOpenFilter={() => setSheet(true)}
            onChangeFilter={(f) => setState({ recFilter: { ...f, date: today } })}
          />
        ) : (
          <BrowseMode courses={courses} tours={tours} revisits={revisits} />
        )}
      </ScrollView>

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

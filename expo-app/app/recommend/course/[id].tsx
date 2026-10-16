import { NaverMapPolylineOverlay } from "@mj-studio/react-native-naver-map";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaperMap } from "@/components/PaperMap";
import { setState, useAppState } from "@/data/store";
import { openDirections, useRecCourses, useRecPlaces } from "@/features/recommend/api";
import { BackPill, HereMarker, NumberMarker, REC, RouteLabelMarker } from "@/features/recommend/ui";
import { todayIso } from "@/lib/anniversary";
import { clockOf, courseTitle, courseTotal, durationOf, fmtDistance, recCategoryOf, walkMin, walkRadius } from "@/lib/recommend";
import { C, F } from "@/theme";

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * 코스 상세(HANDOFF-recommend-all §7, 시안 5c) — 같은 날 A 인증 후 2시간 안에 B 를 인증한 사람이 3명 넘는 동선.
 * 추천 탭이 마지막으로 읽은 자리(store.recHere)로 rec_courses 를 다시 읽어(캐시) 이 코스를 찾습니다.
 */
export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { recHere: here } = useAppState();
  const { data: courses, isLoading } = useRecCourses(here);
  const { data: stats = [] } = useRecPlaces(here, walkRadius(20));
  const c = courses?.find((x) => x.id === id) ?? null;

  const region = useMemo(() => {
    if (!c) return undefined;
    const pts = [[c.a_lat, c.a_lng], [c.b_lat, c.b_lng], ...(here ? [[here.lat, here.lng]] : [])];
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
    const padLat = Math.max(0.0015, (Math.max(...lats) - Math.min(...lats)) * 0.35);
    const padLng = Math.max(0.0015, (Math.max(...lngs) - Math.min(...lngs)) * 0.35);
    return {
      latitude: Math.min(...lats) - padLat, longitude: Math.min(...lngs) - padLng,
      latitudeDelta: Math.max(...lats) - Math.min(...lats) + padLat * 2, longitudeDelta: Math.max(...lngs) - Math.min(...lngs) + padLng * 2,
    };
  }, [c, here]);

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 10, paddingHorizontal: 22 }}>
        <BackPill label="둘러보기" onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {isLoading ? <ActivityIndicator color={C.brick} /> : <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>이 코스를 지금은 찾을 수 없어요.</Text>}
        </View>
      </View>
    );
  }

  const todayOf = (place: string) => stats.find((s) => s.place === place)?.today_count ?? 0;
  const arrive = clockOf(nowMin() + walkMin(c.a_distance_m));
  const go = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState({
      recHeading: { placeKey: c.a_place, name: c.a_name, lat: c.a_lat, lng: c.a_lng, at: Date.now() },
      recCourse: { id: c.id, date: todayIso(), places: [{ placeKey: c.a_place, name: c.a_name }, { placeKey: c.b_place, name: c.b_name }] },
    });
    openDirections({ name: c.a_name, lat: c.a_lat, lng: c.a_lng });
  };
  const onMap = () => {
    setState({ ghost: { name: c.a_name, address: "", lat: c.a_lat, lng: c.a_lng } });
    router.navigate("/");
  };

  const row = (n: number, name: string, category: string | null, right: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: n === 1 ? 1 : 0, borderColor: C.lineSoft }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#ffffff" }}>{n}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{name}</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>
          {[recCategoryOf(category, name) ?? category, "영업 정보 없음"].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{right}</Text>
    </View>
  );

  const reasons = [
    `최근 8주 동안 ${c.users}명이 이 순서로 이어 갔어요`,
    `첫 곳에서 보통 ${durationOf(c.gap_min)} 머물고 걸어서 ${walkMin(c.walk_m)}분 옮겨요`,
    here && !here.fallback ? `지금 출발하면 첫 곳에 ${arrive}쯤 닿아요` : `첫 곳 인증이 가장 많은 때는 ${clockOf(c.start_min)}이에요`,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 22, paddingBottom: 24 }}>
        <BackPill label="둘러보기" onPress={() => router.back()} />
        <Text style={{ marginTop: 18, fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: REC.label }}>COURSE{here?.name ? ` · ${here.name}` : ""}</Text>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 24, color: C.ink }}>{courseTitle(c)}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 12, color: C.muted }}>
          총 {durationOf(courseTotal(c))} · 도보 {walkMin(c.walk_m)}분 · 2곳
        </Text>

        <View style={{ marginTop: 16, height: 178, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: C.lineSoft }}>
          <PaperMap region={region} isScrollGesturesEnabled={false} isZoomGesturesEnabled={false} isRotateGesturesEnabled={false} isTiltGesturesEnabled={false}>
            <NaverMapPolylineOverlay
              coords={[...(here ? [{ latitude: here.lat, longitude: here.lng }] : []), { latitude: c.a_lat, longitude: c.a_lng }, { latitude: c.b_lat, longitude: c.b_lng }]}
              width={2.5}
              color={C.brick}
              pattern={[8, 6]}
            />
            {here && <HereMarker lat={here.lat} lng={here.lng} />}
            <NumberMarker lat={c.a_lat} lng={c.a_lng} n={1} name={c.a_name} active={false} label />
            <NumberMarker lat={c.b_lat} lng={c.b_lng} n={2} name={c.b_name} active={false} label />
            <RouteLabelMarker lat={(c.a_lat + c.b_lat) / 2} lng={(c.a_lng + c.b_lng) / 2} text={`도보 ${walkMin(c.walk_m)}분 · ${fmtDistance(c.walk_m)}`} />
          </PaperMap>
        </View>

        <View style={{ marginTop: 6 }}>
          {row(1, c.a_name, c.a_category, `${clockOf(c.start_min)} · 머묾 ${c.gap_min}분`)}
          {row(2, c.b_name, c.b_category, `${clockOf(c.start_min + c.gap_min)} · 오늘 인증 ${todayOf(c.b_place)}`)}
        </View>

        <Text style={{ marginTop: 18, fontFamily: F.serif, fontSize: 16, color: C.ink }}>이 코스를 고른 까닭</Text>
        <View style={{ marginTop: 10, gap: 7 }}>
          {reasons.map((r, i) => (
            <View key={r} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 19, color: C.brick }}>{i + 1}</Text>
              <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: C.ink }}>{r}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 18, borderRadius: 14, backgroundColor: REC.noteBg, padding: 13 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 18, color: REC.noteInk }}>
            두 곳을 모두 인증하면 오늘 기록이 「그날의 코스」로 묶여 내 기록장에 남아요.
          </Text>
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderColor: C.lineSoft, backgroundColor: C.paper }}>
        <Pressable onPress={onMap} style={{ flex: 1, height: 52, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.ink }}>지도에서 보기</Text>
        </Pressable>
        <Pressable onPress={go} style={{ flex: 1.4, height: 52, borderRadius: 18, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>이 코스로 가기</Text>
        </Pressable>
      </View>
    </View>
  );
}

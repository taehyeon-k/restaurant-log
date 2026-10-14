import { useRouter, type Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BoardIcon, CameraIcon, CompassIcon, PeopleIcon, RankBarsIcon } from "./icons";
import { setState, type CommunityTab } from "@/data/store";
import { C, F, TAB_BAR_H } from "@/theme";

const TABS: { name: CommunityTab; label: string; icon: (c: string) => React.ReactNode }[] = [
  { name: "friends", label: "친구", icon: (c) => <PeopleIcon stroke={c} /> },
  { name: "recs", label: "추천", icon: (c) => <CompassIcon stroke={c} /> },
  { name: "ranking", label: "랭킹", icon: (c) => <RankBarsIcon stroke={c} /> },
  { name: "board", label: "게시판", icon: (c) => <BoardIcon stroke={c} /> },
];

type TabBarFn = NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>;
type BottomTabBarProps = Parameters<TabBarFn>[0];

/**
 * 커뮤니티 탭바(핸드오프 §4) — 메인 TabBar 와 같은 색 · 그림자 · 62px 카메라. 메뉴만 친구 · 추천 · [카메라] · 랭킹 · 게시판.
 * 마지막에 본 탭을 저장소에 남겨, 다음에 들어오면 그 탭부터 엽니다.
 */
export default function CommunityTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const current = state.routes[state.index]?.name;

  const item = (t: (typeof TABS)[number]) => {
    const route = state.routes.find((r) => r.name === t.name);
    if (!route) return <View key={t.name} style={s.tab} />;
    const active = current === t.name;
    const color = active ? C.brick : "#a29a8c";
    return (
      <Pressable
        key={t.name}
        style={s.tab}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (e.defaultPrevented) return;
          setState({ communityTab: t.name });
          if (!active) navigation.navigate(route.name);
          // 이미 그 탭이면 쌓인 상세(랭킹 상세 · 글)를 걷고 첫 화면으로.
          else if (t.name === "ranking" || t.name === "board") navigation.navigate(route.name, { screen: "index" });
        }}
      >
        {t.icon(color)}
        <Text style={[s.label, { color }]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { height: TAB_BAR_H + insets.bottom, paddingBottom: insets.bottom }]}>
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={s.gap} />
      {item(TABS[2])}
      {item(TABS[3])}

      <Pressable
        accessibilityLabel="사진으로 방문 인증"
        style={s.shutter}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // TODO(공개 범위 선택 UI 설계 후): 커뮤니티에서 연 촬영은 마지막 단계의 「친구 소식에 올리기」를 켠 채로 시작.
          router.push("/capture");
        }}
      >
        <CameraIcon size={26} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    overflow: "visible",
    paddingTop: 12,
    shadowColor: C.ink,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  tab: { flex: 1, alignItems: "center", gap: 4 },
  gap: { flex: 1 },
  label: { fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.2 },
  shutter: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    left: "50%",
    marginLeft: -31,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: C.brick,
    borderWidth: 3,
    borderColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.brick,
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});

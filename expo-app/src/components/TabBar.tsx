import { useRouter, type Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, CalendarIcon, CameraIcon, MapPinIcon, PersonIcon, RingsIcon } from "./icons";
import { useActiveBook } from "@/data/books";
import { useRecapUnseen } from "@/features/recap/useRecapState";
import { C, F, TAB_BAR_H } from "@/theme";

const LABEL: Record<string, string> = {
  calendar: "캘린더",
  index: "지도",
  wish: "위시리스트",
  anniversary: "기념일",
  account: "내계정",
};

const ICON: Record<string, (color: string) => React.ReactNode> = {
  calendar: (c) => <CalendarIcon stroke={c} />,
  index: (c) => <MapPinIcon stroke={c} />,
  wish: (c) => <BookmarkIcon size={19} stroke={c} />,
  anniversary: (c) => <RingsIcon stroke={c} />,
  account: (c) => <PersonIcon stroke={c} />,
};

/**
 * 탭 4개 + 절대 위치 카메라 버튼(핸드오프 §2). 5칸 그리드를 흉내내지 않고,
 * 가운데 버튼은 탭이 아니라 router.push('/capture') — 탭 상태를 건드리지 않습니다.
 */
type TabBarFn = NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>;
type BottomTabBarProps = Parameters<TabBarFn>[0];

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // 막 끝난 분기 리캡을 아직 끝까지 보지 않았으면 캘린더 아이콘에 점.
  const recapUnseen = useRecapUnseen();
  // 연인 기록이면 위시리스트 칸이 「기념일」이 됩니다. 연인 기록의 위시리스트는 지도 필터로 봅니다(§3-7).
  const { isCouple, readOnly } = useActiveBook();

  const item = (name: string) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    if (!route) return <View style={s.tab} />;
    const active = state.index === index;
    const color = active ? C.brick : "#a29a8c";
    const dot = route.name === "calendar" && recapUnseen;
    return (
      <Pressable
        key={route.key}
        style={s.tab}
        accessibilityRole="button"
        onPress={() => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!active && !e.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        <View>
          {ICON[route.name]?.(color)}
          {dot && <View style={s.dot} />}
        </View>
        <Text style={[s.label, { color }]}>{LABEL[route.name] ?? route.name}</Text>
      </Pressable>
    );
  };


  return (
    <View style={[s.bar, { height: TAB_BAR_H + insets.bottom, paddingBottom: insets.bottom }]}>
      {item("calendar")}
      {item("index")}
      <View style={s.gap} />
      {item(isCouple ? "anniversary" : "wish")}
      {item("account")}

      <Pressable
        accessibilityLabel="사진으로 방문 인증"
        style={s.shutter}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (readOnly) return Alert.alert("연결이 끊긴 기록장이에요", "읽기만 할 수 있어요. 지도 ≡ 메뉴에서 다른 기록장을 골라 주세요.");
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
    overflow: "visible", // Android: 솟은 버튼이 잘려 터치가 씹히지 않게
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
  dot: { position: "absolute", top: -2, right: -4, width: 7, height: 7, borderRadius: 4, backgroundColor: C.brick, borderWidth: 1.5, borderColor: C.card },
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

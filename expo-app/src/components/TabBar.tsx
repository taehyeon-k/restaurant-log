import { useRouter, type Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarIcon, CameraIcon, MapPinIcon, PeopleIcon, PersonIcon, RingsIcon } from "./icons";
import { useActiveBook } from "@/data/books";
import { useCommunityUnseen } from "@/features/community/api";
import { playCommunityTransition } from "@/features/community/Transition";
import { useRecapUnseen } from "@/features/recap/useRecapState";
import { C, F, TAB_BAR_H } from "@/theme";

const LABEL: Record<string, string> = {
  calendar: "캘린더",
  index: "지도",
  anniversary: "기념일",
  account: "내계정",
};

const ICON: Record<string, (color: string) => React.ReactNode> = {
  calendar: (c) => <CalendarIcon stroke={c} />,
  index: (c) => <MapPinIcon stroke={c} />,
  anniversary: (c) => <RingsIcon stroke={c} />,
  account: (c) => <PersonIcon stroke={c} />,
};

/**
 * 탭 3개 + 「커뮤니티」 단추 + 절대 위치 카메라 버튼(핸드오프 §2). 5칸 그리드를 흉내내지 않고,
 * 가운데 버튼은 탭이 아니라 router.push('/capture') — 탭 상태를 건드리지 않습니다.
 * 「커뮤니티」도 같은 방식입니다: 전환 판을 띄우고 /community 를 엽니다. 탭이 아니라서 벽돌색(선택됨)이 되지 않습니다.
 */
type TabBarFn = NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>;
type BottomTabBarProps = Parameters<TabBarFn>[0];

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // 막 끝난 분기 리캡을 아직 끝까지 보지 않았으면 캘린더 아이콘에 점.
  const recapUnseen = useRecapUnseen();
  // 연인 기록이면 커뮤니티 칸이 「기념일」이 됩니다. 연인 기록의 위시리스트는 지도에서 봅니다(§3-7).
  const { isCouple, readOnly } = useActiveBook();
  // 마지막으로 커뮤니티를 본 뒤 친구가 공유한 기록이 있으면 커뮤니티 아이콘에 점.
  const { data: communityUnseen = 0 } = useCommunityUnseen();

  const item = (name: string) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    if (!route) return <View style={s.tab} />;
    const active = state.index === index;
    const color = active ? C.brick : OFF;
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
        <Text style={[s.label, { color }]}>{route.name === "account" && isCouple ? "연인계정" : LABEL[route.name] ?? route.name}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { height: TAB_BAR_H + insets.bottom, paddingBottom: insets.bottom }]}>
      {item("calendar")}
      {item("index")}
      <View style={s.gap} />
      {isCouple ? (
        item("anniversary")
      ) : (
        <Pressable
          style={s.tab}
          accessibilityRole="button"
          accessibilityLabel={communityUnseen > 0 ? "커뮤니티, 새 소식 있음" : "커뮤니티"}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playCommunityTransition();
          }}
        >
          <View>
            <PeopleIcon stroke={OFF} />
            {communityUnseen > 0 && <View style={s.dot} />}
          </View>
          <Text style={[s.label, { color: OFF }]}>커뮤니티</Text>
        </Pressable>
      )}
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

const OFF = "#a29a8c";

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

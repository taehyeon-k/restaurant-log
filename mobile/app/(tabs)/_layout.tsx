import { Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { BookmarkIcon, CameraIcon } from "@/components/ui";
import { C, FONT, SHADOW, TAB_BAR_HEIGHT } from "@/lib/theme";

type TabId = "calendar" | "index" | "wish" | "account";

/** 탭은 넷뿐입니다 — 가운데 카메라는 탭이 아니라 그냥 버튼입니다(§2). */
const TABS: { name: TabId; label: string }[] = [
  { name: "calendar", label: "캘린더" },
  { name: "index", label: "지도" },
  { name: "wish", label: "위시리스트" },
  { name: "account", label: "내계정" },
];

function icon(id: TabId, color: string) {
  const common = { stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (id) {
    case "calendar":
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <G {...common}>
            <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <Path d="M3.5 9.6h17M8.2 3.4v3M15.8 3.4v3" />
            <Path d="M7.6 13.2h3M13.4 13.2h3M7.6 16.8h3" />
          </G>
        </Svg>
      );
    case "index":
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <G {...common}>
            <Path d="M12 21s7-6.3 7-11.3A7 7 0 005 9.7C5 14.7 12 21 12 21z" />
            <Circle cx="12" cy="9.7" r="2.4" />
          </G>
        </Svg>
      );
    case "wish":
      return <BookmarkIcon size={19} stroke={color} strokeWidth={1.6} />;
    case "account":
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <G {...common}>
            <Circle cx="12" cy="8.6" r="3.8" />
            <Path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" />
          </G>
        </Svg>
      );
  }
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.paper } }}
      tabBar={(props) => <DinaryTabBar {...props} />}
    >
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="wish" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

/**
 * 5칸 격자를 흉내내지 않습니다 — 탭 4개 + 절대 위치 버튼입니다.
 * 가운데 버튼은 `router.push('/capture')` 를 부를 뿐 탭 상태를 건드리지 않습니다.
 */
function DinaryTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeName = state.routes[state.index]?.name;

  const go = (name: TabId) => {
    const event = navigation.emit({ type: "tabPress", target: name, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name);
  };

  const shoot = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/capture");
  };

  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  return (
    <View
      // 솟은 가운데 버튼이 탭바 밖으로 넘칩니다 — Android 에서 터치가 씹히지 않게
      // overflow 를 열어 두고, 위쪽에 버튼이 지나갈 여백을 둡니다.
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 24,
          flexDirection: "row",
          alignItems: "flex-start",
          backgroundColor: C.card,
          borderTopWidth: 1,
          borderTopColor: C.lineSoft,
          overflow: "visible",
        },
        SHADOW.tabBar,
      ]}
    >
      {left.map((t) => (
        <TabButton key={t.name} id={t.name} label={t.label} active={activeName === t.name} onPress={() => go(t.name)} />
      ))}

      <View style={{ flex: 1, alignItems: "center" }}>
        <Pressable
          onPress={shoot}
          accessibilityRole="button"
          accessibilityLabel="사진으로 방문 인증"
          hitSlop={10}
          style={({ pressed }) => [
            {
              position: "absolute",
              top: -46,
              width: 62,
              height: 62,
              borderRadius: 31,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? "#9d4826" : C.brick,
              borderWidth: 3,
              borderColor: C.card,
            },
            SHADOW.shutter,
          ]}
        >
          <CameraIcon size={26} />
        </Pressable>
      </View>

      {right.map((t) => (
        <TabButton key={t.name} id={t.name} label={t.label} active={activeName === t.name} onPress={() => go(t.name)} />
      ))}
    </View>
  );
}

function TabButton({
  id,
  label,
  active,
  onPress,
}: {
  id: TabId;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? C.brick : "#a29a8c";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 44 }}
    >
      {icon(id, color)}
      <Text style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: 0.2, color }}>{label}</Text>
    </Pressable>
  );
}

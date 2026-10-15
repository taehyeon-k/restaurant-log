import { Tabs } from "expo-router";
import TabBar from "@/components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }} initialRouteName="index">
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="recommend" />
      {/* 연인 기록에서만 탭바에 「연인」으로 보입니다. 개인 기록에선 지도 ≡ 메뉴의 계정 사진으로 엽니다(HANDOFF-recommend §1-2). */}
      <Tabs.Screen name="account" />
      {/* 탭바에 칸이 없는 화면 — 캘린더 배너에서 여는 기념일(§3), 기록장 메뉴에서 여는 내계정(§2). 탭바는 그대로 보입니다. */}
      <Tabs.Screen name="anniversary" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

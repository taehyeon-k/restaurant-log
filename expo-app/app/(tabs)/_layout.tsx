import { Tabs } from "expo-router";
import TabBar from "@/components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }} initialRouteName="index">
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="index" />
      {/* 연인 기록일 때 커뮤니티 칸에 들어가는 기념일 탭(HANDOFF-couple §3-7) */}
      <Tabs.Screen name="anniversary" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

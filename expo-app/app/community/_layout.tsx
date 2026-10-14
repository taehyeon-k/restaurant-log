import { useQueryClient } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import CommunityTabBar from "@/components/CommunityTabBar";
import { getState, setState } from "@/data/store";
import { markCommunitySeen } from "@/features/community/api";
import { C } from "@/theme";

/** 커뮤니티 — 메인 탭과 따로 쌓이는 화면 묶음(핸드오프 §4). 처음엔 친구, 그다음부터는 마지막에 본 탭. */
export default function CommunityLayout() {
  const qc = useQueryClient();

  // 들어올 때마다 「지난번 본 시각」을 받아 두고(친구 줄의 새 기록 테두리) 지금으로 바꿉니다 — 탭바 점이 꺼집니다.
  useEffect(() => {
    markCommunitySeen(qc).then((since) => setState({ communitySeenSince: since }));
  }, [qc]);

  return (
    <Tabs
      tabBar={(props) => <CommunityTabBar {...props} />}
      initialRouteName={getState().communityTab}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.paper } }}
    >
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="recs" />
      <Tabs.Screen name="ranking" />
      <Tabs.Screen name="board" />
      <Tabs.Screen name="people" options={{ href: null }} />
    </Tabs>
  );
}

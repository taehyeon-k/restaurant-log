import { useQueryClient } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import CommunityTabBar from "@/components/CommunityTabBar";
import { getState, setState } from "@/data/store";
import { markCommunitySeen } from "@/features/community/api";
import { ProfileSheetProvider } from "@/features/community/ProfileSheet";
import { C } from "@/theme";

/**
 * 커뮤니티 — 메인 탭과 따로 쌓이는 화면 묶음(핸드오프 §4). 처음엔 친구, 그다음부터는 마지막에 본 탭.
 * 「탐색」(recs)은 하단 추천 탭으로 옮겨 가서 탭에서 빼고 갤러리를 둡니다(HANDOFF-gallery §2). 닉네임 → 프로필 창은 어느 탭에서든.
 */
export default function CommunityLayout() {
  const qc = useQueryClient();

  // 들어올 때마다 「지난번 본 시각」을 받아 두고(친구 줄의 새 기록 테두리) 지금으로 바꿉니다 — 탭바 점이 꺼집니다.
  useEffect(() => {
    markCommunitySeen(qc).then((since) => setState({ communitySeenSince: since }));
  }, [qc]);

  return (
    <ProfileSheetProvider>
      <Tabs
        tabBar={(props) => <CommunityTabBar {...props} />}
        initialRouteName={initialTab()}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.paper } }}
      >
        <Tabs.Screen name="friends" />
        <Tabs.Screen name="gallery" />
        <Tabs.Screen name="ranking" />
        <Tabs.Screen name="board" />
        <Tabs.Screen name="recs" options={{ href: null }} />
        <Tabs.Screen name="people" options={{ href: null }} />
      </Tabs>
    </ProfileSheetProvider>
  );
}

/** 마지막에 본 탭 — 예전 「탐색」(recs)이면 갤러리로. */
function initialTab() {
  const t = getState().communityTab as string;
  return t === "recs" ? "gallery" : (t as ReturnType<typeof getState>["communityTab"]);
}

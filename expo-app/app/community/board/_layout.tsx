import { Stack } from "expo-router";
import { C } from "@/theme";

/** 게시판 — 목록 · 글 · 글쓰기. 프로필 창은 커뮤니티 묶음(community/_layout)이 둘러 줍니다. */
export default function BoardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
    </Stack>
  );
}

import { Stack } from "expo-router";
import { ProfileSheetProvider } from "@/features/community/ProfileSheet";
import { C } from "@/theme";

/** 게시판 — 목록 · 글 · 글쓰기. 닉네임을 누르면 어느 화면에서든 프로필 창이 올라옵니다. */
export default function BoardLayout() {
  return (
    <ProfileSheetProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
        <Stack.Screen name="new" options={{ presentation: "modal" }} />
      </Stack>
    </ProfileSheetProvider>
  );
}

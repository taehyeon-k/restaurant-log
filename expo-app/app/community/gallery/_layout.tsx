import { Stack } from "expo-router";
import { C } from "@/theme";

/** 갤러리 — 격자(01) · 사진 보기(02) · 올리기(03) · 검색(04) · 좁힌 격자(가게 · 동네 · 메뉴). */
export default function GalleryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="list" />
      <Stack.Screen name="search" options={{ animation: "fade" }} />
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
    </Stack>
  );
}

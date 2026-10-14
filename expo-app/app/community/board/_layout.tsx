import { Stack } from "expo-router";
import { C } from "@/theme";

export default function BoardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
    </Stack>
  );
}

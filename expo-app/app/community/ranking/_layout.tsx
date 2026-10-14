import { Stack } from "expo-router";
import { C } from "@/theme";

export default function RankingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }} />;
}

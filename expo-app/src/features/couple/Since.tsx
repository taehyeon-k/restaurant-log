import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { dayCount } from "@/lib/anniversary";
import { dottedDate } from "@/lib/types";
import { C, F } from "@/theme";

/** 채운 하트 — 사귄 날 줄. */
export const HeartIcon = ({ size = 12, fill = C.brick }: { size?: number; fill?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 20.5C6.6 16.8 3 13.6 3 9.4A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 9 1.8c0 4.2-3.6 7.4-9 11.1z" fill={fill} />
  </Svg>
);

/** 「2025.02.14~ ♥ D+611일」 — Mono, 날짜는 먹색, 하트와 D+N일은 벽돌색. */
export function SinceDays({ startedOn, size = 12, on }: { startedOn: string; size?: number; on?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Text style={{ fontFamily: F.mono, fontSize: size, color: C.ink }}>{dottedDate(startedOn)}~</Text>
      <HeartIcon size={12} />
      <Text style={{ fontFamily: F.mono, fontSize: size, color: C.brick }}>D+{dayCount(startedOn, on)}일</Text>
    </View>
  );
}

import { Pressable, Text, View } from "react-native";
import { C, F } from "@/theme";

/** 내계정 · 연인계정이 함께 쓰는 통계 칸과 메뉴 줄. */
export function Stat({ value, label, brick, border }: { value: number; label: string; brick?: boolean; border?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderLeftWidth: border ? 1 : 0, borderLeftColor: C.lineSoft }}>
      <Text style={{ fontFamily: F.mono, fontSize: 22, color: brick ? C.brick : C.ink }}>{value}</Text>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{label}</Text>
    </View>
  );
}

export function Row({ label, right, onPress, danger, border = true }: { label: string; right: React.ReactNode; onPress?: () => void; danger?: boolean; border?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderTopWidth: border ? 1 : 0, borderTopColor: C.lineSoft }}>
      <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: danger ? C.faint : C.ink }}>{label}</Text>
      {right}
    </Pressable>
  );
}

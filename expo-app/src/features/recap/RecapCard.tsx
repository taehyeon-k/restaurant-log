import { Pressable, Text, View } from "react-native";
import { C, F } from "@/theme";
import type { RecapSummary } from "./compute";
import { quarterLabel, seasonOf } from "./seasons";

/**
 * 1b — 캘린더 위 리캡 카드(HANDOFF quarterly recap §2). 계절과 상관없이 늘 먹색입니다.
 * 누르면 재생, 길게 누르면 지난 리캡 목록. 끝까지 보기 전까지 오른쪽 위에 점.
 */
export default function RecapCard({
  summary, nick, unseen, onOpen, onList,
}: { summary: RecapSummary; nick: string; unseen: boolean; onOpen: () => void; onList: () => void }) {
  const season = seasonOf(summary.quarter);
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onList}
      accessibilityLabel={`${season.name} 식탁 리캡 보기`}
      accessibilityHint="길게 누르면 지난 분기 리캡 목록이 열립니다"
      style={({ pressed }) => ({
        marginTop: 12, marginHorizontal: 16, borderRadius: 18, backgroundColor: C.ink, paddingVertical: 12, paddingLeft: 12, paddingRight: 14,
        flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 34, lineHeight: 40, color: C.card }}>D</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.card }}>{nick}의 {season.name} 식탁</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: "#cdc6b8" }}>
          {quarterLabel(summary.quarter)} 리캡 · {summary.count}끼
        </Text>
      </View>
      <View style={{ borderRadius: 15, backgroundColor: C.card, paddingVertical: 7, paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.ink }}>보기</Text>
      </View>
      {unseen && (
        <View style={{ position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: C.brick, borderWidth: 1.5, borderColor: C.ink }} />
      )}
    </Pressable>
  );
}

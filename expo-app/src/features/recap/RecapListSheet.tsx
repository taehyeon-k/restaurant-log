import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { BottomSheetModal, Eyebrow } from "@/components/ui";
import { C, F } from "@/theme";
import { Star } from "./anim";
import type { RecapSummary } from "./compute";
import { quarterLabel, seasonOf } from "./seasons";

/**
 * 1c — 지난 분기 리캡 목록(HANDOFF quarterly recap §2). 캘린더 카드를 길게 누르거나 달 제목을 누르면 열립니다.
 * 기록이 있는 분기만, 최신순. 누르면 그 분기 리캡을 처음부터 재생합니다.
 */
export default function RecapListSheet({
  visible, list, seen, onClose, onPick,
}: { visible: boolean; list: RecapSummary[]; seen: (q: string) => boolean; onClose: () => void; onPick: (q: string) => void }) {
  const { height } = useWindowDimensions();
  return (
    <BottomSheetModal visible={visible} onClose={onClose} dim={0.42}>
      <View style={{ marginTop: -8, alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line }} />
      <View style={{ marginTop: 18 }}>
        <Eyebrow wide>RECAPS</Eyebrow>
      </View>
      <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink }}>지난 분기 리캡</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>{list.length}개</Text>
      </View>
      <ScrollView style={{ marginTop: 10, maxHeight: height * 0.55 }} bounces={false}>
        {list.map((r) => {
          const season = seasonOf(r.quarter);
          const unseen = !seen(r.quarter);
          return (
            <Pressable
              key={r.quarter}
              onPress={() => onPick(r.quarter)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ width: 52, height: 68, borderRadius: 10, backgroundColor: season.deep, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <Star size={34} fill={season.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>
                  {season.name} 식탁
                  {unseen && <Text style={{ fontFamily: F.sansMd, fontSize: 10, color: C.brick }}>{"  "}NEW</Text>}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>
                  {[quarterLabel(r.quarter), `${r.count}끼`, r.topPlace].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: "#a29a8c" }}>›</Text>
            </Pressable>
          );
        })}
        {list.length === 0 && (
          <Text style={{ paddingVertical: 18, fontFamily: F.sans, fontSize: 13, color: C.muted }}>아직 지난 분기 리캡이 없어요.</Text>
        )}
      </ScrollView>
      <Text style={{ marginTop: 16, fontFamily: F.sans, fontSize: 12, lineHeight: 20, color: C.faint }}>
        기록이 한 건도 없는 분기는 리캡이 만들어지지 않아요.
      </Text>
    </BottomSheetModal>
  );
}

import { Pressable, Text, View } from "react-native";
import Sheet from "@/components/Sheet";
import { BookmarkIcon, Eyebrow } from "@/components/ui";
import { C, FONT } from "@/lib/theme";

/**
 * 「아직 없는 곳」 시트 — 검색한 이름이 기록에도 위시에도 없을 때.
 * 담아둔 곳을 검색했는데 "어느 쪽에도 없다"고 말하면 안 되므로, 이 시트는
 * 기록·위시 양쪽에서 이름을 찾아본 뒤에만 떠야 합니다.
 */
export default function SearchMissSheet({
  name,
  bottomInset,
  onAddRecord,
  onAddWish,
  onClose,
}: {
  name: string;
  bottomInset: number;
  onAddRecord: () => void;
  onAddWish: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} bottomInset={bottomInset} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
      <Eyebrow wide>아직 없는 곳</Eyebrow>
      <Text style={{ marginTop: 6, fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>{name}</Text>
      <Text style={{ marginTop: 6, fontSize: 11.5, lineHeight: 18, color: C.faint, fontFamily: FONT.sans }}>
        기록에도 위시리스트에도 없는 이름입니다. 어느 쪽으로 둘까요?
      </Text>

      <View style={{ marginTop: 14, gap: 8 }}>
        <Pressable
          onPress={onAddRecord}
          style={{
            minHeight: 50,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 18,
            backgroundColor: C.ink,
          }}
        >
          <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: C.card }} />
          <Text style={{ fontSize: 13.5, color: C.card, fontFamily: FONT.sansMedium }}>다녀왔어요 · 기록 추가</Text>
        </Pressable>

        <Pressable
          onPress={onAddWish}
          style={{
            minHeight: 50,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: C.hairline,
          }}
        >
          <BookmarkIcon size={14} stroke={C.ink} />
          <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sansMedium }}>가고 싶어요 · 예정 추가</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

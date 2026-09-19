import { Pressable, Text, View } from "react-native";
import Sheet from "@/components/Sheet";
import { BookmarkIcon, Eyebrow } from "@/components/ui";
import type { Place } from "@/lib/places";
import { dottedDate, type Restaurant } from "@/lib/types";
import { C, FONT } from "@/lib/theme";

/** 지도 검색에서 이미 기록한 가게를 찾았을 때의 작은 시트(§9). */
export default function FoundHitSheet({
  restaurant,
  place,
  bottomInset,
  onRevisit,
  onAddWish,
  onOpenPlace,
  onClose,
}: {
  restaurant: Restaurant;
  place: Place;
  bottomInset: number;
  onRevisit: () => void;
  onAddWish: () => void;
  onOpenPlace: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} bottomInset={bottomInset} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
      <Eyebrow wide>찾았습니다</Eyebrow>
      <Text style={{ marginTop: 6, fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>{restaurant.name}</Text>
      <Text style={{ marginTop: 4, fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
        {[restaurant.category, restaurant.region].filter(Boolean).join(" · ")}
      </Text>
      <Text style={{ marginTop: 6, fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>
        기록 {place.visits.length}건 · 마지막 {dottedDate(place.latest.visited_at)}
      </Text>

      <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={onRevisit}
          style={{
            flex: 1,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            backgroundColor: C.ink,
          }}
        >
          <Text style={{ fontSize: 13, color: C.card, fontFamily: FONT.sansMedium }}>여기 또 왔어요 · 기록 추가</Text>
        </Pressable>

        <Pressable
          onPress={onAddWish}
          accessibilityLabel="위시리스트에 담기"
          style={{
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e4dfd3",
          }}
        >
          <BookmarkIcon size={16} stroke={C.muted} />
        </Pressable>

        <Pressable
          onPress={onOpenPlace}
          style={{
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e4dfd3",
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: FONT.sans }}>지난 기록 보기</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

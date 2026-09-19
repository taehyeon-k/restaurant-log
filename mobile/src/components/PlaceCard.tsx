import { Pressable, Text, View } from "react-native";
import type { Place } from "@/lib/places";
import { C, FONT, SHADOW } from "@/lib/theme";
import { MobileStars, PhotoFill, Pigs, VerifiedMark } from "@/components/ui";

/**
 * 같은 이름의 방문 기록을 하나로 묶은 카드 — 지도 시트 목록의 한 줄.
 * 값은 §4.1 의 카드 명세입니다: radius 20 · 테두리 1px · 썸네일 64×64 radius 16.
 */
export default function PlaceCard({ place, onPress }: { place: Place; onPress: () => void }) {
  const summary =
    [place.latest.menu, place.latest.review].filter(Boolean).join(" · ") ||
    "기록을 아직 쓰지 않았습니다";

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          gap: 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: place.verified ? "#e0c3b1" : C.hairline,
          backgroundColor: C.card,
          padding: 12,
        },
        SHADOW.card,
      ]}
    >
      <PhotoFill
        src={place.photo}
        category={place.category}
        radius={16}
        style={{ width: 64, height: 64 }}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {!place.photo && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: 0.7, color: "rgba(251,250,246,.9)" }}>
              {place.visits.length}장
            </Text>
          )}
        </View>
        {place.verified && (
          <View style={{ position: "absolute", right: -4, bottom: -4 }}>
            <VerifiedMark size={26} shadow />
          </View>
        )}
      </PhotoFill>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontFamily: FONT.serifBold, fontSize: 16, color: C.ink }}
          >
            {place.name}
          </Text>
          {place.visits.length > 1 && (
            <View style={{ borderRadius: 9, backgroundColor: "#efe9dc", paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.muted }}>
                기록 {place.visits.length}
              </Text>
            </View>
          )}
          {place.revisit && (
            <View style={{ borderRadius: 9, backgroundColor: C.brickSoft, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONT.sans, fontSize: 9.5, color: C.brick }}>재방문</Text>
            </View>
          )}
        </View>

        <Text style={{ marginTop: 4, fontFamily: FONT.sans, fontSize: 11.5, color: C.faint }}>
          {[place.category, place.region].filter(Boolean).join(" · ")}
        </Text>

        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MobileStars rating={place.rating} size={12.5} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted }}>
            {place.rating?.toFixed(1) ?? "—"}
          </Text>
          <View style={{ width: 1, height: 11, backgroundColor: C.hairline }} />
          <Pigs row={place} />
        </View>

        <Text
          numberOfLines={2}
          style={{ marginTop: 6, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 17, color: C.body }}
        >
          {summary}
        </Text>
      </View>
    </Pressable>
  );
}

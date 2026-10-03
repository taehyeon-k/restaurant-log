import { Pressable, Text, View } from "react-native";
import { VerifiedMark } from "@/components/icons";
import { MobileStars, PhotoBox, Pigs } from "@/components/ui";
import type { Place } from "@/lib/places";
import { C, F, SHADOW } from "@/theme";

/** 같은 이름의 방문 기록을 하나로 묶은 카드. */
export default function PlaceCard({ place, onOpen }: { place: Place; onOpen: () => void }) {
  const summary = [place.latest.menu, place.latest.review].filter(Boolean).join(" · ") || "기록을 아직 쓰지 않았습니다";
  return (
    <Pressable
      onPress={onOpen}
      style={[{ flexDirection: "row", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: place.verified ? "#e0c3b1" : "#ded8cb", backgroundColor: C.card, padding: 12 }, SHADOW.card]}
    >
      <View>
        <PhotoBox src={place.photo} category={place.category} size={74} radius={15}>
          {!place.photo && <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.7, color: "rgba(251,250,246,.9)" }}>{place.visits.length}장</Text>}
        </PhotoBox>
        {place.verified && <View style={{ position: "absolute", right: -4, bottom: -4 }}><VerifiedMark size={26} /></View>}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 16, color: C.ink }}>{place.name}</Text>
          {place.visits.length > 1 && (
            <Text style={{ borderRadius: 9, backgroundColor: "#efe9dc", paddingHorizontal: 7, paddingVertical: 2, fontFamily: F.mono, fontSize: 9, color: C.muted, overflow: "hidden" }}>기록 {place.visits.length}</Text>
          )}
          {place.revisit && (
            <Text style={{ borderRadius: 9, backgroundColor: C.brickSoft, paddingHorizontal: 7, paddingVertical: 2, fontFamily: F.sans, fontSize: 9.5, color: C.brick, overflow: "hidden" }}>재방문</Text>
          )}
        </View>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[place.category, place.region].filter(Boolean).join(" · ")}</Text>
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MobileStars rating={place.rating} />
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{place.rating?.toFixed(1) ?? "—"}</Text>
          <View style={{ width: 1, height: 11, backgroundColor: "#ded8cb" }} />
          <Pigs row={place} />
        </View>
        <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: "#4d4842" }}>{summary}</Text>
      </View>
    </Pressable>
  );
}

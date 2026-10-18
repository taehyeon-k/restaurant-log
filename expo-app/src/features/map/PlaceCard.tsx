import { Platform, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { VerifiedMark } from "@/components/icons";
import { MobileStars, PhotoBox, Pigs } from "@/components/ui";
import type { BookMember } from "@/data/books";
import { Pair } from "@/features/couple/Avatars";
import type { Place } from "@/lib/places";
import { C, F, SHADOW } from "@/theme";

/** 연인 기록일 때 카드에 붙는 것 — 두 사람 아바타·한 줄 상태·기념일 라벨(HANDOFF-couple §3-5). */
export type CoupleCardInfo = { me: BookMember | null; partner: BookMember | null; meWrote: boolean; partnerWrote: boolean; tag?: string };

const coupleStatus = (c: CoupleCardInfo) => {
  if (c.meWrote && c.partnerWrote) return "둘 다 썼어요";
  if (c.meWrote) return `${c.partner?.nickname ?? "상대"}의 한 줄을 기다리는 중`;
  if (c.partnerWrote) return "내 한 줄을 기다리는 중";
  return "한 줄을 기다리는 중";
};

/** 「기록 n」·「재방문」 배지 — 두 배지가 같은 높이로 서도록 상자 높이를 고정하고 글자를 가운데에 둡니다. */
const badge: ViewStyle = { height: 18, paddingHorizontal: 7, paddingVertical: 0, borderRadius: 9, alignItems: "center", justifyContent: "center" };
const badgeText: TextStyle = { lineHeight: 13, ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null) };

/** 같은 이름의 방문 기록을 하나로 묶은 카드. */
export default function PlaceCard({ place, onOpen, couple }: { place: Place; onOpen: () => void; couple?: CoupleCardInfo }) {
  const comment = place.latest.review || "기록을 아직 쓰지 않았습니다";
  return (
    <Pressable
      onPress={onOpen}
      style={[{ flexDirection: "row", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: place.verified ? "#e0c3b1" : "#ded8cb", backgroundColor: C.card, padding: 12 }, SHADOW.card]}
    >
      <View style={{ alignSelf: "flex-start" }}>
        <PhotoBox src={place.photo} category={place.category} size={74} radius={15}>
          {!place.photo && <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.7, color: "rgba(251,250,246,.9)" }}>{place.visits.length}장</Text>}
        </PhotoBox>
        {place.verified && <View style={{ position: "absolute", right: 2, bottom: 2 }}><VerifiedMark size={21} /></View>}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 16, color: C.ink }}>{place.name}</Text>
          {place.visits.length > 1 && (
            <View style={[badge, { backgroundColor: "#efe9dc" }]}>
              <Text style={[badgeText, { fontFamily: F.mono, fontSize: 9, color: C.muted }]}>기록 {place.visits.length}</Text>
            </View>
          )}
          {couple?.tag && (
            <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.brick }}>{couple.tag}</Text>
          )}
          {place.revisit && (
            <View style={[badge, { backgroundColor: C.brickSoft }]}>
              <Text style={[badgeText, { fontFamily: F.sans, fontSize: 9.5, color: C.brick }]}>재방문</Text>
            </View>
          )}
        </View>
        {!!place.region && (
          <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{place.region}</Text>
        )}
        {!!(place.category || place.latest.menu) && (
          <View style={{ marginTop: 3, flexDirection: "row", alignItems: "center" }}>
            {!!place.category && <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: F.sansMd, fontSize: 11.5, color: C.faint }}>{place.category}</Text>}
            {!!place.category && !!place.latest.menu && <Text style={{ paddingHorizontal: 6, fontFamily: F.sans, fontSize: 11.5, color: "#cfc8ba" }}>|</Text>}
            {!!place.latest.menu && <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sans, fontSize: 11.5, color: "#4d4842" }}>{place.latest.menu}</Text>}
          </View>
        )}
        <View style={{ marginTop: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MobileStars rating={place.rating} />
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{place.rating?.toFixed(1) ?? "—"}</Text>
          <View style={{ width: 1, height: 11, backgroundColor: "#ded8cb" }} />
          <Pigs row={place} />
        </View>
        {couple ? (
          <View style={{ marginTop: 7, flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Pair me={couple.me} partner={couple.partner} size={20} overlap={6} meEmpty={!couple.meWrote} partnerEmpty={!couple.partnerWrote} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sans, fontSize: 11, color: couple.meWrote && couple.partnerWrote ? C.muted : C.faint }}>{coupleStatus(couple)}</Text>
          </View>
        ) : (
          <Text numberOfLines={2} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: "#4d4842" }}>{comment}</Text>
        )}
      </View>
    </Pressable>
  );
}

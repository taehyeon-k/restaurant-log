import { Text, View, type ViewStyle } from "react-native";
import { EMPTY_AVATAR, ME_COLOR, PARTNER_COLOR, type BookMember } from "@/data/books";
import { C, F } from "@/theme";

/** 이름 첫 글자 원 — 나 = 벽돌색, 상대 = 청회색(HANDOFF-couple §0). 안 쓴 쪽은 empty 로 흐리게. */
export function Avatar({
  name, color, size = 30, empty, ring = C.card, style,
}: { name: string; color: string; size?: number; empty?: boolean; ring?: string; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          width: size, height: size, borderRadius: size / 2, backgroundColor: empty ? EMPTY_AVATAR : color,
          borderWidth: Math.max(1.5, size / 15), borderColor: ring, alignItems: "center", justifyContent: "center",
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: F.sansBd, fontSize: Math.max(9, size * 0.42), lineHeight: Math.max(11, size * 0.52), color: C.card, includeFontPadding: false }}>
        {Array.from(name.trim() || "?")[0]}
      </Text>
    </View>
  );
}

/** 두 사람 아바타 — 나 먼저, 상대가 오른쪽에 겹칩니다(기본 -9px). */
export function Pair({
  me, partner, size = 30, overlap = 9, meEmpty, partnerEmpty, ring,
}: {
  me: BookMember | null; partner: BookMember | null; size?: number; overlap?: number; meEmpty?: boolean; partnerEmpty?: boolean; ring?: string;
}) {
  return (
    <View style={{ flexDirection: "row" }}>
      <Avatar name={me?.nickname ?? "나"} color={ME_COLOR} size={size} empty={meEmpty} ring={ring} />
      <Avatar name={partner?.nickname ?? "?"} color={PARTNER_COLOR} size={size} empty={partnerEmpty || !partner} ring={ring} style={{ marginLeft: -overlap }} />
    </View>
  );
}

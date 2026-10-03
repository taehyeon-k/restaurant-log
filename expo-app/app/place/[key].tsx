import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon } from "@/components/icons";
import { BackButton, Button, Eyebrow, MobileStars, PhotoBox, Pigs } from "@/components/ui";
import { useRows } from "@/data/queries";
import { photoCount } from "@/lib/record";
import { feltLabel, feltLevel } from "@/lib/price";
import { groupPlaces } from "@/lib/places";
import { dottedDate, verifiedDateTime } from "@/lib/types";
import { C, F } from "@/theme";

/** 가게 화면 — 같은 가게의 방문 기록들을 묶어 보여줍니다. */
export default function PlaceRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: rows = [] } = useRows();
  const place = groupPlaces(rows.filter((r) => !r.pending)).find((p) => p.key === key);

  if (!place) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
        <BackButton />
        <Text style={{ padding: 24, fontFamily: F.sans, color: C.faint }}>이 가게를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const revisit = () =>
    router.push({
      pathname: "/record/edit",
      params: {
        kind: place.kind, name: place.name, address: place.address ?? "", lat: String(place.lat ?? ""),
        lng: String(place.lng ?? ""), category: place.category ?? "", revisit: "1",
      },
    });

  const addWish = () =>
    router.push({
      pathname: "/wish/new",
      params: {
        name: place.name, where_text: place.address ?? place.region ?? "", category: place.category ?? "",
        lat: String(place.lat ?? ""), lng: String(place.lng ?? ""),
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <PhotoBox src={place.photo} category={place.category} radius={0} style={{ width: "100%", height: 210 }}>
          {!place.photo && (
            <Text style={{ position: "absolute", left: 20, bottom: 18, fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.3, color: "rgba(251,250,246,.85)" }}>
              {place.category} · {place.visits.length}번 방문
            </Text>
          )}
        </PhotoBox>

        <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
          <Eyebrow>NO. {String(place.latest.id).padStart(3, "0")}</Eyebrow>
          <Text style={{ marginTop: 9, fontFamily: F.serif, fontSize: 27, color: C.ink }}>{place.name}</Text>
          <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 12, color: C.faint }}>
            {[place.category, place.region].filter(Boolean).join(" · ")}
          </Text>
          {place.address && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, color: "#a29a8c" }}>{place.address}</Text>}

          <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <MobileStars rating={place.rating} size={15} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{place.rating?.toFixed(1) ?? "—"}</Text>
            <View style={{ width: 1, height: 13, backgroundColor: "#ded8cb" }} />
            <Pigs row={place} w={18} h={17} />
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{feltLabel(feltLevel(place))}</Text>
          </View>

          {place.keywords.length > 0 && (
            <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {place.keywords.map((k) => (
                <Text key={k} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e2dccf", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.sans, fontSize: 11, color: C.muted, overflow: "hidden" }}>{k}</Text>
              ))}
            </View>
          )}

          <View style={{ marginTop: 20, gap: 8 }}>
            <Button label="여기 또 왔어요 · 기록 추가" onPress={revisit} />
            <Pressable onPress={addWish} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <BookmarkIcon size={14} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>또 갈 예정으로 담기</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 26, paddingTop: 18, borderTopWidth: 1, borderTopColor: "#ded8cb", flexDirection: "row", justifyContent: "space-between" }}>
            <Eyebrow>RECORDS</Eyebrow>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>기록 {place.visits.length}개</Text>
          </View>

          <View style={{ marginTop: 12, gap: 9 }}>
            {place.visits.map((v) => {
              const shots = photoCount(v);
              return (
                <Pressable
                  key={v.id}
                  onPress={() => router.push({ pathname: "/record/[id]", params: { id: String(v.id) } })}
                  style={{ borderRadius: 18, borderWidth: 1, borderColor: v.verified ? "#e0c3b1" : "#e2dccf", backgroundColor: C.card, paddingHorizontal: 15, paddingVertical: 13 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ink }}>
                      {v.verified && v.verified_at ? verifiedDateTime(v.verified_at) : dottedDate(v.visited_at)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <MobileStars rating={v.rating} size={11.5} />
                      <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{v.rating?.toFixed(1) ?? "—"}</Text>
                    </View>
                  </View>
                  <Text style={{ marginTop: 7, fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{v.menu || "메뉴를 쓰지 않았습니다"}</Text>
                  <Text numberOfLines={2} style={{ marginTop: 5, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: "#4d4842" }}>{v.review || "메모가 비어 있습니다"}</Text>
                  <Text style={{ marginTop: 9, fontFamily: F.mono, fontSize: 9.5, color: "#a29a8c" }}>
                    {shots ? `${shots}장 · PHOTO ${Math.min(v.cover_index ?? 0, shots - 1) + 1}` : "사진 없음"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 16, top: insets.top + 8, backgroundColor: "rgba(251,250,246,.92)", borderRadius: 22 }}>
        <BackButton />
      </View>
    </View>
  );
}

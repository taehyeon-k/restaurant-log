/** 기록이 두 개 이상인 가게 화면 — 웹 `PlaceScreen.tsx` 그대로입니다. */
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton, BookmarkIcon, Eyebrow, MobileStars, PhotoFill, Pigs } from "@/components/ui";
import { groupPlaces } from "@/lib/places";
import { photoCount } from "@/lib/record";
import { feltLabel, feltLevel } from "@/lib/price";
import { useRestaurants, useWishes } from "@/lib/data";
import { dottedDate, matchWish, verifiedDateTime, type Kind } from "@/lib/types";
import { C, FONT, SHADOW } from "@/lib/theme";

export default function PlaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows, isLoading } = useRestaurants();
  const { wishes } = useWishes();

  const params = useLocalSearchParams<{ key: string; kind?: string }>();
  const kind: Kind = params.kind === "cafe" ? "cafe" : "restaurant";

  const place = useMemo(() => {
    const visible = rows.filter((r) => !r.pending && r.kind === kind);
    return groupPlaces(visible).find((p) => p.key === params.key) ?? null;
  }, [rows, kind, params.key]);

  if (!place) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12.5, color: C.faint, fontFamily: FONT.sans }}>
          {isLoading ? "불러오는 중…" : "가게를 찾지 못했습니다."}
        </Text>
      </View>
    );
  }

  const addWish = () => {
    if (matchWish(wishes, place.name)) {
      router.push("/wish");
      return;
    }
    router.push({
      pathname: "/wish/new",
      params: {
        name: place.name,
        where_text: place.address ?? place.region ?? "",
        category: place.category ?? "",
        lat: place.lat != null ? String(place.lat) : "",
        lng: place.lng != null ? String(place.lng) : "",
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <PhotoFill src={place.photo} category={place.category} style={{ height: 210 }}>
          {!place.photo && (
            <Text
              style={{
                position: "absolute",
                bottom: 18,
                left: 20,
                fontFamily: FONT.mono,
                fontSize: 9.5,
                letterSpacing: 1.3,
                color: "rgba(251,250,246,.85)",
              }}
            >
              {place.category} · {place.visits.length}번 방문
            </Text>
          )}
        </PhotoFill>

        <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 40 }}>
          <Eyebrow>NO. {String(place.latest.id).padStart(3, "0")}</Eyebrow>

          <Text style={{ marginTop: 9, fontFamily: FONT.serifBold, fontSize: 27, color: C.ink }}>{place.name}</Text>

          <Text style={{ marginTop: 8, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>
            {[place.category, place.region].filter(Boolean).join(" · ")}
          </Text>

          {place.address && (
            <Text style={{ marginTop: 6, fontSize: 11.5, color: C.dim, fontFamily: FONT.sans }}>{place.address}</Text>
          )}

          <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <MobileStars rating={place.rating} size={15} gap={1.5} />
            <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted }}>
              {place.rating?.toFixed(1) ?? "—"}
            </Text>
            <View style={{ width: 1, height: 13, backgroundColor: C.hairline }} />
            <Pigs row={place} w={18} h={17} />
            <Text style={{ fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>{feltLabel(feltLevel(place))}</Text>
          </View>

          {place.keywords.length > 0 && (
            <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {place.keywords.map((k) => (
                <View key={k} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e2dccf", paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>{k}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: 20, gap: 8 }}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/record/new",
                  params: {
                    kind: place.kind,
                    name: place.name,
                    address: place.address ?? "",
                    lat: place.lat != null ? String(place.lat) : "",
                    lng: place.lng != null ? String(place.lng) : "",
                    category: place.category ?? "",
                    revisit: "1",
                  },
                })
              }
              style={{ minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: C.ink }}
            >
              <Text style={{ fontSize: 13.5, color: C.card, fontFamily: FONT.sansMedium }}>여기 또 왔어요 · 기록 추가</Text>
            </Pressable>

            <Pressable
              onPress={addWish}
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
              <BookmarkIcon size={14} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sans }}>또 갈 예정으로 담기</Text>
            </Pressable>
          </View>

          <View
            style={{
              marginTop: 26,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderTopColor: C.hairline,
              paddingTop: 18,
            }}
          >
            <Eyebrow>RECORDS</Eyebrow>
            <Text style={{ fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>기록 {place.visits.length}개</Text>
          </View>

          <View style={{ marginTop: 12, gap: 9 }}>
            {place.visits.map((v) => {
              const shots = photoCount(v);

              return (
                <Pressable
                  key={v.id}
                  onPress={() => router.push(`/record/${v.id}`)}
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: v.verified ? "#e0c3b1" : "#e2dccf",
                    backgroundColor: C.card,
                    paddingHorizontal: 15,
                    paddingVertical: 13,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ink }}>
                      {v.verified && v.verified_at ? verifiedDateTime(v.verified_at) : dottedDate(v.visited_at)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <MobileStars rating={v.rating} size={11.5} />
                      <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted }}>
                        {v.rating?.toFixed(1) ?? "—"}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ marginTop: 7, fontSize: 11.5, color: C.muted, fontFamily: FONT.sans }}>
                    {v.menu || "메뉴를 쓰지 않았습니다"}
                  </Text>

                  <Text numberOfLines={2} style={{ marginTop: 5, fontSize: 11.5, lineHeight: 18, color: C.body, fontFamily: FONT.sans }}>
                    {v.review || "메모가 비어 있습니다"}
                  </Text>

                  <Text style={{ marginTop: 9, fontFamily: FONT.mono, fontSize: 9.5, color: C.dim }}>
                    {shots ? `${shots}장 · PHOTO ${Math.min(v.cover_index ?? 0, shots - 1) + 1}` : "사진 없음"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <BackButton
        onPress={() => router.back()}
        style={[
          { position: "absolute", left: 16, top: insets.top + 8, backgroundColor: "rgba(251,250,246,.92)" },
          SHADOW.card,
        ]}
      />
    </View>
  );
}

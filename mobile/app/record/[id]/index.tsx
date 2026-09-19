/** 기록 상세 — 웹 `RecordScreen.tsx` 그대로입니다. */
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton, BookmarkIcon, Eyebrow, MobileStars, PhotoFill, Pigs, VerifiedMark } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { photosOf } from "@/lib/record";
import { useRefresh, useRestaurants, useWishes } from "@/lib/data";
import { dottedDate, matchWish, verifiedDateTime } from "@/lib/types";
import { C, FONT, SHADOW } from "@/lib/theme";

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const { rows, isLoading } = useRestaurants();
  const { wishes } = useWishes();

  const { id } = useLocalSearchParams<{ id: string }>();
  const record = rows.find((r) => r.id === Number(id)) ?? null;

  const photos = record ? photosOf(record) : [];
  const cover = Math.min(record?.cover_index ?? 0, Math.max(0, photos.length - 1));

  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12.5, color: C.faint, fontFamily: FONT.sans }}>
          {isLoading ? "불러오는 중…" : "기록을 찾지 못했습니다."}
        </Text>
      </View>
    );
  }

  const index = shown ?? cover;
  const current = photos[index] ?? null;

  async function makeCover() {
    setBusy(true);
    const { error: err } = await supabase
      .from("restaurants")
      .update({ cover_index: index, photo_url: photos[index] ?? null, updated_at: new Date().toISOString() })
      .eq("id", record!.id);
    setBusy(false);
    if (err) return setError(err.message);
    refresh();
  }

  function remove() {
    Alert.alert("기록 지우기", `"${record!.name}" 기록을 지울까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "지우기",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error: err } = await supabase.from("restaurants").delete().eq("id", record!.id);
          setBusy(false);
          if (err) return setError(err.message);
          refresh();
          router.back();
        },
      },
    ]);
  }

  const verifyNote =
    "그 자리에서 찍은 사진으로 인증되었습니다." +
    (record.acc ? ` 촬영 시 위치 정확도 약 ${record.acc}m.` : "") +
    " 좌표는 기록에 남지 않습니다.";

  const addWish = () => {
    // 이미 담아둔 이름이면 새로 만들지 않습니다(중복·유령 위시 방지).
    if (matchWish(wishes, record.name)) {
      router.push("/wish");
      return;
    }
    router.push({
      pathname: "/wish/new",
      params: {
        name: record.name,
        where_text: record.address ?? record.region ?? "",
        category: record.category ?? "",
        lat: record.lat != null ? String(record.lat) : "",
        lng: record.lng != null ? String(record.lng) : "",
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <PhotoFill src={current} category={record.category} style={{ height: 268 }}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {!current && (
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.4, color: "rgba(251,250,246,.9)" }}>
                PHOTO {index + 1} / {Math.max(1, photos.length)}
              </Text>
            )}
          </View>
          {record.verified && (
            <View style={{ position: "absolute", right: 16, bottom: 16 }}>
              <VerifiedMark size={52} shadow />
            </View>
          )}
        </PhotoFill>

        {photos.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}
            style={{ borderBottomWidth: 1, borderBottomColor: "#e6e0d3" }}
          >
            {photos.map((url, i) => (
              <Pressable key={url} onPress={() => setShown(i)} accessibilityLabel={`사진 ${i + 1}`}>
                <PhotoFill
                  src={url}
                  category={record.category}
                  radius={14}
                  style={{
                    width: 54,
                    height: 54,
                    borderWidth: i === index ? 1.5 : 1,
                    borderColor: i === index ? C.brick : C.hairline,
                  }}
                >
                  {i === cover && (
                    <Text style={{ position: "absolute", top: 2, right: 3, fontFamily: FONT.mono, fontSize: 8, color: C.brick }}>
                      ★
                    </Text>
                  )}
                </PhotoFill>
              </Pressable>
            ))}

            {index !== cover && (
              <Pressable
                onPress={makeCover}
                disabled={busy}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: C.line,
                  paddingHorizontal: 13,
                }}
              >
                <Text style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT.sans }}>대표사진으로</Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
          <Eyebrow>NO. {String(record.id).padStart(3, "0")}</Eyebrow>

          <Text style={{ marginTop: 8, fontFamily: FONT.serifBold, fontSize: 25, color: C.ink }}>{record.name}</Text>

          <Text style={{ marginTop: 7, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>
            {[record.category, record.region].filter(Boolean).join(" · ")}
          </Text>

          <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <MobileStars rating={record.rating} size={15} gap={1.5} />
            <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted }}>
              {record.rating?.toFixed(1) ?? "—"}
            </Text>
            <View style={{ width: 1, height: 13, backgroundColor: C.hairline }} />
            <Pigs row={record} w={18} h={17} />
          </View>

          <View style={{ marginTop: 22, gap: 18, borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 18 }}>
            <Row label="방문">
              {record.verified && record.verified_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 13.5, color: C.ink }}>
                    {verifiedDateTime(record.verified_at)}
                  </Text>
                  <VerifiedMark size={14} />
                </View>
              ) : (
                <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sans }}>
                  {dottedDate(record.visited_at) || "날짜를 쓰지 않았습니다"}
                </Text>
              )}
            </Row>

            <Row label="메뉴">
              {record.menus.some((m) => m.name.trim()) ? (
                <View style={{ gap: 5 }}>
                  {record.menus
                    .filter((m) => m.name.trim())
                    .map((m, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <Text style={{ fontSize: 13.5, lineHeight: 22, color: C.ink, fontFamily: FONT.sans }}>{m.name}</Text>
                        {m.price != null && (
                          <Text style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.muted }}>
                            {m.price.toLocaleString("ko-KR")}원
                          </Text>
                        )}
                      </View>
                    ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13.5, lineHeight: 22, color: C.ink, fontFamily: FONT.sans }}>
                  {record.menu || "아직 쓰지 않았습니다"}
                </Text>
              )}
            </Row>

            <Row label="메모">
              <Text style={{ fontFamily: FONT.serif, fontSize: 16, lineHeight: 31, color: "#2e2a25" }}>
                {record.review || "메모가 비어 있습니다."}
              </Text>
            </Row>

            <Row label="주소">
              <Text style={{ fontSize: 12.5, color: C.body, fontFamily: FONT.sans }}>
                {record.address ?? record.region ?? "주소 미등록"}
              </Text>
            </Row>
          </View>

          {record.keywords.length > 0 && (
            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {record.keywords.map((k) => (
                <View key={k} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e2dccf", paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>{k}</Text>
                </View>
              ))}
            </View>
          )}

          {record.verified && (
            <View
              style={{
                marginTop: 20,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#e4dfd3",
                backgroundColor: C.card,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 11.5, lineHeight: 20, color: C.muted, fontFamily: FONT.sans }}>{verifyNote}</Text>
            </View>
          )}

          {record.from_wish && (
            <View
              style={{
                marginTop: 20,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#e0c3b1",
                backgroundColor: "#f9f0e9",
                paddingHorizontal: 16,
                paddingVertical: 15,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <BookmarkIcon size={17} fill={C.brick} stroke={C.brick} />
                <Text style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: 1.7, color: C.brick }}>WISH MET</Text>
              </View>
              <Text style={{ marginTop: 8, fontFamily: FONT.serif, fontSize: 14, lineHeight: 25, color: "#2e2a25" }}>
                {record.from_wish.days === 0
                  ? `${dottedDate(record.from_wish.saved_at)}에 담아두고 바로 다녀오셨네요.`
                  : `${dottedDate(record.from_wish.saved_at)}에 담아둔 곳입니다. ${record.from_wish.days}일 만에 드디어 다녀오셨네요.`}
              </Text>
            </View>
          )}

          {error.length > 0 && (
            <Text style={{ marginTop: 16, fontSize: 12, color: "#a8412a", fontFamily: FONT.sans }}>{error}</Text>
          )}

          <View style={{ marginTop: 20, gap: 8 }}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/record/new",
                  params: {
                    kind: record.kind,
                    name: record.name,
                    address: record.address ?? "",
                    lat: record.lat != null ? String(record.lat) : "",
                    lng: record.lng != null ? String(record.lng) : "",
                    category: record.category ?? "",
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

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => router.push(`/record/${record.id}/edit`)}
                style={{
                  flex: 1,
                  minHeight: 50,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#e4dfd3",
                }}
              >
                <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sansMedium }}>기록 수정</Text>
              </Pressable>
              <Pressable
                onPress={remove}
                disabled={busy}
                style={{
                  minHeight: 50,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#e4dfd3",
                  paddingHorizontal: 18,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 12.5, color: C.faint, fontFamily: FONT.sans }}>지우기</Text>
              </Pressable>
            </View>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ marginTop: 7 }}>{children}</View>
    </View>
  );
}

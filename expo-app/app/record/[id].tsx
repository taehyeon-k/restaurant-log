import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Dimensions, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, VerifiedMark } from "@/components/icons";
import { BackButton, Button, Eyebrow, MobileStars, PhotoBox, Pigs } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useRows } from "@/data/queries";
import { photosOf } from "@/lib/record";
import { supabase } from "@/lib/supabase";
import { dottedDate, verifiedDateTime } from "@/lib/types";
import { C, F } from "@/theme";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ marginTop: 7 }}>{children}</View>
    </View>
  );
}

export default function RecordRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const record = rows.find((r) => r.id === Number(id));
  const photos = record ? photosOf(record) : [];
  const cover = record ? Math.min(record.cover_index ?? 0, Math.max(0, photos.length - 1)) : 0;
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
        <BackButton />
      </View>
    );
  }

  const idx = shown ?? cover;
  const current = photos[idx] ?? null;

  async function makeCover() {
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ cover_index: idx, photo_url: photos[idx] ?? null, updated_at: new Date().toISOString() })
      .eq("id", record!.id);
    setBusy(false);
    if (error) return setError(error.message);
    refreshAll(qc);
  }

  function remove() {
    Alert.alert(`"${record!.name}" 기록을 지울까요?`, undefined, [
      { text: "취소", style: "cancel" },
      {
        text: "지우기",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.from("restaurants").delete().eq("id", record!.id);
          setBusy(false);
          if (error) return setError(error.message);
          await refreshAll(qc);
          router.back();
        },
      },
    ]);
  }

  const revisit = () =>
    router.push({
      pathname: "/record/edit",
      params: {
        kind: record.kind, name: record.name, address: record.address ?? "", lat: String(record.lat ?? ""),
        lng: String(record.lng ?? ""), category: record.category ?? "", revisit: "1",
      },
    });
  const addWish = () =>
    router.push({
      pathname: "/wish/new",
      params: {
        name: record.name, where_text: record.address ?? record.region ?? "", category: record.category ?? "",
        lat: String(record.lat ?? ""), lng: String(record.lng ?? ""),
      },
    });

  const verifyNote =
    "그 자리에서 찍은 사진으로 인증되었습니다." +
    (record.acc ? ` 촬영 시 위치 정확도 약 ${record.acc}m.` : "") +
    " 좌표는 기록에 남지 않습니다.";

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <PhotoBox src={current} category={record.category} radius={0} style={{ width: Dimensions.get("window").width, height: 268 }}>
          {!current && (
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: "rgba(251,250,246,.9)" }}>
              PHOTO {idx + 1} / {Math.max(1, photos.length)}
            </Text>
          )}
          {record.verified && (
            <View style={{ position: "absolute", right: 16, bottom: 16 }}>
              <VerifiedMark size={52} />
            </View>
          )}
        </PhotoBox>

        {photos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }} style={{ borderBottomWidth: 1, borderBottomColor: "#e6e0d3" }}>
            {photos.map((url, i) => (
              <Pressable key={url} onPress={() => setShown(i)} accessibilityLabel={`사진 ${i + 1}`}
                style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden", backgroundColor: "#eae5da", borderWidth: i === idx ? 1.5 : 1, borderColor: i === idx ? C.brick : "#ded8cb" }}>
                <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} />
                {i === cover && <Text style={{ position: "absolute", top: 1, right: 3, fontSize: 8, color: C.brick }}>★</Text>}
              </Pressable>
            ))}
            {idx !== cover && (
              <Pressable onPress={makeCover} disabled={busy} style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: C.line, paddingHorizontal: 13, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>대표사진으로</Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
          <Eyebrow>NO. {String(record.id).padStart(3, "0")}</Eyebrow>
          <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 25, color: C.ink }}>{record.name}</Text>
          <Text style={{ marginTop: 7, fontFamily: F.sans, fontSize: 12, color: C.faint }}>
            {[record.category, record.region].filter(Boolean).join(" · ")}
          </Text>
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <MobileStars rating={record.rating} size={15} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{record.rating?.toFixed(1) ?? "—"}</Text>
            <View style={{ width: 1, height: 13, backgroundColor: "#ded8cb" }} />
            <Pigs row={record} w={18} h={17} />
          </View>

          <View style={{ marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: "#ded8cb", gap: 18 }}>
            <Field label="방문">
              {record.verified && record.verified_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>{verifiedDateTime(record.verified_at)}</Text>
                  <VerifiedMark size={14} />
                </View>
              ) : (
                <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{dottedDate(record.visited_at) || "날짜를 쓰지 않았습니다"}</Text>
              )}
            </Field>
            <Field label="메뉴">
              {record.menus.some((m) => m.name.trim()) ? (
                <View style={{ gap: 5 }}>
                  {record.menus.filter((m) => m.name.trim()).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                      <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{m.name}</Text>
                      {m.price != null && <Text style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted }}>{m.price.toLocaleString("ko-KR")}원</Text>}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 22, color: C.ink }}>{record.menu || "아직 쓰지 않았습니다"}</Text>
              )}
            </Field>
            <Field label="메모">
              <Text style={{ fontFamily: F.serif, fontSize: 16, lineHeight: 31, color: "#2e2a25" }}>{record.review || "메모가 비어 있습니다."}</Text>
            </Field>
            <Field label="주소">
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: "#4d4842" }}>{record.address ?? record.region ?? "주소 미등록"}</Text>
            </Field>
          </View>

          {record.keywords.length > 0 && (
            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {record.keywords.map((k) => (
                <Text key={k} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e2dccf", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.sans, fontSize: 11, color: C.muted, overflow: "hidden" }}>{k}</Text>
              ))}
            </View>
          )}

          {record.verified && (
            <View style={{ marginTop: 20, borderRadius: 18, borderWidth: 1, borderColor: "#e4dfd3", backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 20, color: C.muted }}>{verifyNote}</Text>
            </View>
          )}

          {record.from_wish && (
            <View style={{ marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 16, paddingVertical: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <BookmarkIcon size={17} fill={C.brick} stroke={C.brick} />
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.8, color: C.brick }}>WISH MET</Text>
              </View>
              <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 14, lineHeight: 25, color: "#2e2a25" }}>
                {record.from_wish.days === 0
                  ? `${dottedDate(record.from_wish.saved_at)}에 담아두고 바로 다녀오셨네요.`
                  : `${dottedDate(record.from_wish.saved_at)}에 담아둔 곳입니다. ${record.from_wish.days}일 만에 드디어 다녀오셨네요.`}
              </Text>
            </View>
          )}

          {!!error && <Text style={{ marginTop: 16, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}

          <View style={{ marginTop: 20, gap: 8 }}>
            <Button label="여기 또 왔어요 · 기록 추가" onPress={revisit} />
            <Pressable onPress={addWish} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <BookmarkIcon size={14} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>또 갈 예정으로 담기</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button style={{ flex: 1, borderColor: "#e4dfd3" }} kind="line" label="기록 수정" onPress={() => router.push({ pathname: "/record/edit", params: { id: String(record.id) } })} />
              <Pressable onPress={remove} disabled={busy} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#e4dfd3", paddingHorizontal: 18, justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>지우기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 16, top: insets.top + 8, backgroundColor: "rgba(251,250,246,.92)", borderRadius: 22 }}>
        <BackButton />
      </View>
    </View>
  );
}

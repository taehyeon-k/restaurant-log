import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BellIcon, BookmarkIcon, CameraIcon, ExternalIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useWishes } from "@/data/queries";
import { setState } from "@/data/store";
import { supabase } from "@/lib/supabase";
import { SOURCE_LABEL } from "@/lib/sourceLink";
import { dottedDate, wishKind } from "@/lib/types";
import { firstUrl, noteWithoutUrl } from "@/lib/wishes";
import { C, F, SHADOW } from "@/theme";

/** 책갈피 마커·검색·월력에서 연 그 가게 하나짜리 시트(transparentModal). */
export default function WishSheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: wishes = [] } = useWishes();
  const wish = wishes.find((w) => w.id === id);
  const [busy, setBusy] = useState(false);

  if (!wish) return <Pressable style={{ flex: 1 }} onPress={() => router.back()} />;

  const noteUrl = firstUrl(wish.note);
  const url = wish.source_url ?? noteUrl;
  const body = noteWithoutUrl(wish.note, noteUrl);
  // 출처 종류를 아는 위시만 태그 — 메모 URL 만 있는 옛 위시는 태그 없이 「원본 보기」.
  const sourceLabel = wish.source_url && wish.source_kind ? SOURCE_LABEL[wish.source_kind] : null;

  async function toggleNotify() {
    setBusy(true);
    await supabase.from("wishes").update({ notify: !wish!.notify }).eq("id", wish!.id);
    setBusy(false);
    refreshAll(qc);
  }

  function remove() {
    Alert.alert(`"${wish!.name}" 을(를) 위시리스트에서 삭제할까요?`, undefined, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => { setBusy(true); await supabase.from("wishes").delete().eq("id", wish!.id); setBusy(false); await refreshAll(qc); router.back(); } },
    ]);
  }

  return (
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(28,26,23,.34)" }}>
      <Pressable style={{ flex: 1 }} onPress={() => router.back()} accessibilityLabel="닫기" />
      <View style={[{ backgroundColor: C.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, paddingBottom: insets.bottom + 20 }, SHADOW.sheet]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <BookmarkIcon size={15} fill={C.brick} stroke={C.brick} />
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.8, color: C.brick }}>위시리스트</Text>
        </View>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{wish.name}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{[wish.category, wish.where_text].filter(Boolean).join(" · ")}</Text>
        {sourceLabel && (
          <Text style={{ marginTop: 10, alignSelf: "flex-start", borderRadius: 9, backgroundColor: "#efebe2", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.mono, fontSize: 10.5, color: "#4d4842", overflow: "hidden" }}>
            {sourceLabel}에서 담음 · {wish.saved_at.slice(5, 10).replace("-", ".")}
          </Text>
        )}
        {wish.plan_date && (
          <Text style={{ marginTop: 10, alignSelf: "flex-start", borderRadius: 9, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.mono, fontSize: 10.5, color: C.brick, overflow: "hidden" }}>
            {dottedDate(wish.plan_date)} 갈 예정
          </Text>
        )}
        <Text style={{ marginTop: 12, fontFamily: F.serif, fontSize: 14, lineHeight: 26, color: "#2e2a25" }}>{body || "적어둔 말이 없습니다."}</Text>

        <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Button
            label="여기 왔어요"
            icon={<CameraIcon size={18} stroke={C.card} />}
            onPress={() => { setState({ kind: wishKind(wish) }); router.replace({ pathname: "/capture", params: { verifyWishId: wish.id, kind: wishKind(wish) } }); }}
            style={{ flex: 1, borderRadius: 18 }}
          />
          <Pressable onPress={toggleNotify} disabled={busy} accessibilityLabel="근처 알림" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: wish.notify ? "#e0c3b1" : C.line, backgroundColor: wish.notify ? C.brickSoft : C.card, alignItems: "center", justifyContent: "center" }}>
            <BellIcon size={16} stroke={wish.notify ? C.brick : C.muted} />
          </Pressable>
          {url && (
            <Pressable onPress={() => Linking.openURL(url)} accessibilityLabel="출처 열기" style={{ height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12, color: "#4d4842" }}>{sourceLabel ? `${sourceLabel}에서 보기` : "원본 보기"}</Text>
              <ExternalIcon size={13} stroke="#4d4842" />
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 }}>
          <Pressable onPress={() => router.replace({ pathname: "/wish/new", params: { id: wish.id } })} style={{ padding: 6 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>수정</Text></Pressable>
          <Text style={{ color: "#d8d3c8" }}>·</Text>
          <Pressable onPress={() => { setState({ mapSegment: "wish" }); router.dismissTo({ pathname: "/", params: { segment: "wish" } }); }} style={{ padding: 6 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>위시리스트에서 보기</Text></Pressable>
          <Text style={{ color: "#d8d3c8" }}>·</Text>
          <Pressable onPress={remove} disabled={busy} style={{ padding: 6 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>삭제</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

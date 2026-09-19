import { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import Sheet from "@/components/Sheet";
import { BellIcon, BookmarkIcon, ExternalLinkIcon } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { dottedDate, type Wish } from "@/lib/types";
import { firstUrl, noteWithoutUrl } from "@/lib/wishNote";
import { C, FONT } from "@/lib/theme";

/** 지도에서 책갈피 마커를 눌렀을 때 뜨는 그 가게 하나짜리 시트(§5). */
export default function WishSheet({
  wish,
  bottomInset,
  onClose,
  onCaptureHere,
  onViewList,
  onChanged,
  onDeleted,
}: {
  wish: Wish;
  bottomInset: number;
  onClose: () => void;
  onCaptureHere: () => void;
  onViewList: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const url = firstUrl(wish.note);
  const noteBody = noteWithoutUrl(wish.note, url);

  async function toggleNotify() {
    setBusy(true);
    await supabase.from("wishes").update({ notify: !wish.notify }).eq("id", wish.id);
    setBusy(false);
    onChanged();
  }

  function remove() {
    Alert.alert("삭제", `"${wish.name}" 을(를) 위시리스트에서 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await supabase.from("wishes").delete().eq("id", wish.id);
          setBusy(false);
          onDeleted();
        },
      },
    ]);
  }

  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <BookmarkIcon size={15} fill={C.brick} stroke={C.brick} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: 1.7, color: C.brick }}>
          위시리스트
        </Text>
      </View>

      <Text style={{ marginTop: 6, fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>{wish.name}</Text>
      <Text style={{ marginTop: 4, fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
        {[wish.category, wish.where_text].filter(Boolean).join(" · ")}
      </Text>

      {wish.plan_date && (
        <View
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            borderRadius: 9,
            borderWidth: 1,
            borderColor: "#e0c3b1",
            backgroundColor: "#f9f0e9",
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.brick }}>
            {dottedDate(wish.plan_date)} 갈 예정
          </Text>
        </View>
      )}

      <Text style={{ marginTop: 12, fontFamily: FONT.serif, fontSize: 14, lineHeight: 26, color: "#2e2a25" }}>
        {noteBody || "적어둔 말이 없습니다."}
      </Text>

      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={onCaptureHere}
          style={{
            flex: 1,
            minHeight: 50,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            backgroundColor: C.ink,
          }}
        >
          <Text style={{ fontSize: 13.5, color: C.card, fontFamily: FONT.sansMedium }}>여기 왔어요 · 사진 찍기</Text>
        </Pressable>

        <Pressable
          onPress={toggleNotify}
          disabled={busy}
          accessibilityLabel="근처 알림"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: wish.notify ? "#e0c3b1" : C.line,
            backgroundColor: wish.notify ? C.brickSoft : C.card,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <BellIcon size={16} stroke={wish.notify ? C.brick : C.muted} />
        </Pressable>

        {url && (
          <Pressable
            onPress={() => void Linking.openURL(url)}
            accessibilityLabel="출처 열기"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: C.line,
              backgroundColor: C.card,
            }}
          >
            <ExternalLinkIcon size={16} />
          </Pressable>
        )}
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <Pressable onPress={onViewList} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>위시리스트에서 보기</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: C.line }}>·</Text>
        <Pressable onPress={remove} disabled={busy} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>삭제</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

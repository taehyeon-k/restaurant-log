import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { C, F } from "@/theme";
import { addComment, useComments } from "./api";
import { Avatar, K, timeAgo } from "./ui";

/** 친구 소식 카드의 댓글 — 한 줄 120자, 링크 · 연락처는 넣을 수 없습니다. */
export default function CommentsSheet({ recordId, onClose }: { recordId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: comments = [] } = useComments(recordId);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!recordId || !text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await addComment(qc, recordId, text);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글을 남기지 못했습니다");
    }
    setBusy(false);
  }

  return (
    <BottomSheetModal visible={recordId != null} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>댓글 {comments.length}</Text>
        <ScrollView style={{ maxHeight: 320, marginTop: 10 }} contentContainerStyle={{ gap: 12 }}>
          {comments.length === 0 && <Text style={{ paddingVertical: 20, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 댓글이 없습니다.</Text>}
          {comments.map((c) => (
            <View key={c.id} style={{ flexDirection: "row", gap: 9 }}>
              <Avatar name={c.nickname ?? ""} url={c.avatar_url} size={26} seed={c.user_id} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.ink }}>{c.nickname}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(c.created_at)}</Text>
                </View>
                <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: K.text2 }}>{c.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={(t) => setText(t.slice(0, 120))}
            placeholder="한 줄 남기기"
            placeholderTextColor={K.inactive}
            style={{ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, fontFamily: F.sans, fontSize: 13, color: C.ink }}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable onPress={send} disabled={!text.trim() || busy} style={{ minHeight: 44, borderRadius: 14, backgroundColor: C.ink, paddingHorizontal: 14, justifyContent: "center", opacity: !text.trim() || busy ? 0.4 : 1 }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>남기기</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 6, fontFamily: F.mono, fontSize: 10, color: K.inactive, textAlign: "right" }}>{text.length} / 120</Text>
        {!!error && <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}
      </KeyboardAvoidingView>
    </BottomSheetModal>
  );
}

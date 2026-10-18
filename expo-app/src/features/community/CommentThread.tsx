import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { AuthorRow, RecordMini } from "./BoardPost";
import { MoreButton, type MenuTarget } from "./ItemMenu";
import { RecordPickerSheet } from "./RecordPicker";
import { K, timeAgo } from "./ui";

/**
 * 댓글 한 줄 · 입력줄 — 게시판 글(07)과 갤러리 사진(02)이 함께 씁니다.
 * 답글은 한 단계, 숨긴 댓글은 작성자 줄을 두고 본문만 「운영 정책에 따라 삭제된 댓글입니다.」.
 */
export const COMMENT_MAX = 500;
const HIDDEN_COMMENT = "운영 정책에 따라 삭제된 댓글입니다.";

/** 게시판 · 갤러리 댓글의 공통 칸. 기록 칸은 게시판 댓글에만 있습니다. */
export type ThreadComment = {
  id: number; author_id: string; created_at: string; hidden_at: string | null; body: string | null;
  nickname: string | null; avatar_url: string | null; title_label_id: string | null; author_role: "user" | "admin";
  record_id?: number | null; place_name?: string | null; verified?: boolean | null; verified_at?: string | null;
  photo_urls?: string[] | null; cover_index?: number | null; photo_url?: string | null;
};

/** 아바타 26 · 닉네임 · 시간 · 본문 12.5 · (붙인 기록) · 「답글」. 글쓴이가 단 댓글엔 「글쓴이」 꼬리표. */
export function CommentRow({ c, ownerId, target, onReply }: { c: ThreadComment; ownerId: string; target: MenuTarget; onReply?: () => void }) {
  const hidden = !!c.hidden_at && c.body == null;
  const photo = c.record_id ? coverPhoto({ photo_urls: c.photo_urls ?? [], cover_index: c.cover_index ?? 0, photo_url: c.photo_url ?? null }) : null;
  return (
    <View style={{ paddingVertical: 11, gap: 6 }}>
      <AuthorRow
        size={26} userId={c.author_id} name={c.nickname} url={c.avatar_url} titleId={c.title_label_id} role={c.author_role}
        time={timeAgo(c.created_at)}
        badge={c.author_id === ownerId ? (
          <Text style={{ borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, fontFamily: F.sans, fontSize: 9.5, color: C.muted, overflow: "hidden" }}>글쓴이</Text>
        ) : undefined}
        more={<MoreButton target={target} />}
      />
      <View style={{ paddingLeft: 33, gap: 7 }}>
        {hidden ? (
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: K.inactive }}>{HIDDEN_COMMENT}</Text>
        ) : (
          <Text selectable style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: K.text2 }}>{c.body}</Text>
        )}
        {!hidden && !!c.place_name && (
          <View style={{ alignSelf: "flex-start", maxWidth: "100%", borderRadius: 10, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 6, paddingRight: 10 }}>
            <RecordMini size={32} name={c.place_name} photo={photo} verifiedAt={c.verified ? c.verified_at : null} />
          </View>
        )}
        {!!c.hidden_at && !hidden && <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.brick }}>숨긴 댓글 · 운영자에게만 보입니다</Text>}
        {onReply && !hidden && (
          <Pressable onPress={onReply} hitSlop={6} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>답글</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** 입력줄 — (allowRecord 면) 왼쪽 「+」 내 기록 붙이기 + 「댓글 달기」 500자. 문턱(5건)은 없습니다. */
export function CommentInput({
  onSend, replyTo, onClearReply, inputRef, allowRecord,
}: {
  onSend: (p: { body: string; parentId: number | null; recordId: number | null }) => Promise<void>;
  replyTo: ThreadComment | null;
  onClearReply: () => void;
  inputRef: React.RefObject<TextInput | null>;
  allowRecord: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [record, setRecord] = useState<Restaurant | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSend({ body: text, parentId: replyTo?.id ?? null, recordId: record?.id ?? null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setText("");
      setRecord(null);
      onClearReply();
      inputRef.current?.blur();
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글을 남기지 못했습니다");
    }
    setBusy(false);
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.lineSoft, backgroundColor: C.paper, paddingHorizontal: 14, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), gap: 6 }}>
      {(replyTo || record) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {replyTo && (
            <Pressable onPress={onClearReply} style={{ borderRadius: 12, backgroundColor: K.segMap, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>{replyTo.author_role === "admin" ? "DINARY 운영" : replyTo.nickname}에게 답글 ✕</Text>
            </Pressable>
          )}
          {record && (
            <Pressable onPress={() => setRecord(null)} style={{ borderRadius: 12, backgroundColor: C.brickSoft, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>{record.name}{record.verified ? " ✓" : ""} ✕</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {allowRecord && (
          <Pressable onPress={() => setPicking(true)} accessibilityLabel="내 기록 붙이기" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 19, color: C.muted, marginTop: -2 }}>+</Text>
          </Pressable>
        )}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(t) => setText(t.slice(0, COMMENT_MAX))}
          placeholder="댓글 달기"
          placeholderTextColor={K.inactive}
          multiline
          maxLength={COMMENT_MAX}
          style={{ flex: 1, minHeight: 40, maxHeight: 110, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontFamily: F.sans, fontSize: 13, color: C.ink }}
        />
        <Pressable onPress={send} disabled={!text.trim() || busy} style={{ height: 40, borderRadius: 20, backgroundColor: C.ink, paddingHorizontal: 14, justifyContent: "center", opacity: !text.trim() || busy ? 0.4 : 1 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>남기기</Text>
        </Pressable>
      </View>
      {(text.length > COMMENT_MAX - 60 || !!error) && (
        <Text style={{ fontFamily: F.sans, fontSize: 11, color: error ? C.brick : K.inactive, textAlign: error ? "left" : "right" }}>{error || `${text.length} / ${COMMENT_MAX}`}</Text>
      )}
      {allowRecord && <RecordPickerSheet visible={picking} onClose={() => setPicking(false)} onPick={([r]) => setRecord(r ?? null)} title="댓글에 내 기록 붙이기" />}
    </View>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addBoardComment, useBoardComments, useBoardPost, useCourseStops, useCurrentTheme, useIsAdmin, type BoardComment, type BoardPost,
} from "@/features/community/api";
import {
  AuthorRow, boardPill, CourseBlock, PollOptions, postPhoto, postTitle, Reactions, RecordMini, Tags,
} from "@/features/community/BoardPost";
import { MoreButton } from "@/features/community/ItemMenu";
import { RecordPickerSheet } from "@/features/community/RecordPicker";
import { K, Pill, timeAgo } from "@/features/community/ui";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const COMMENT_MAX = 500;
const HIDDEN_POST = "운영 정책에 따라 삭제된 글입니다.";
const HIDDEN_COMMENT = "운영 정책에 따라 삭제된 댓글입니다.";

/** 글 상세 · 댓글(HANDOFF-board-v2 07) — 본문 전체 · 태그 · 투표 / 기록 / 코스 · 반응, 댓글은 시간순 · 답글 한 단계. */
export default function BoardPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: post, isLoading } = useBoardPost(postId);
  const { data: isAdmin } = useIsAdmin();
  const { data: theme } = useCurrentTheme();
  const { data: comments = [] } = useBoardComments(postId);
  const { data: stopsMap } = useCourseStops(post?.type === "course" ? [postId] : []);
  const stops = stopsMap?.get(postId) ?? [];
  const [replyTo, setReplyTo] = useState<BoardComment | null>(null);
  const inputRef = useRef<TextInput>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/community/board"));
  const count = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pill onPress={back} accessibilityLabel="게시판으로" label="‹" />
      <Text style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.muted }}>
        {post ? (post.type === "theme" && post.theme_id === theme?.id ? `주제 · ${theme?.title}` : boardPill(post)) : "게시판"}
      </Text>
      <View style={{ minWidth: 32, alignItems: "flex-end" }}>
        {post && <MoreButton target={{ kind: "post", post }} onEdit={() => router.push({ pathname: "/community/board/new", params: { edit: String(post.id) } })} onDeleted={back} onBlocked={back} />}
      </View>
    </View>
  );

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        {header}
        <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>{isLoading ? "" : "지워졌거나 볼 수 없는 글입니다."}</Text>
      </View>
    );
  }

  const hidden = !!post.hidden_at && !isAdmin;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 12 }}>
          <AuthorRow userId={post.author_id} name={post.nickname} url={post.avatar_url} titleId={post.title_label_id} role={post.author_role} time={timeAgo(post.created_at) + (post.edited_at ? " · 고침" : "")} />
          {hidden ? (
            <Text style={{ paddingVertical: 20, fontFamily: F.sans, fontSize: 13, color: K.inactive }}>{HIDDEN_POST}</Text>
          ) : (
            <PostContent post={post} stops={stops} />
          )}
          {post.hidden_at && isAdmin && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>숨긴 글 · 운영자에게만 보입니다</Text>}
        </View>

        <View style={{ marginTop: 20, marginHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.ink }}>댓글 {count}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>시간순</Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
          {comments.length === 0 && <Text style={{ paddingVertical: 24, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>첫 댓글을 남겨 보세요.</Text>}
          {comments.map((c) => (
            <View key={c.id}>
              <CommentRow c={c} post={post} onReply={() => { setReplyTo(c); inputRef.current?.focus(); }} />
              {c.replies.map((r) => (
                <View key={r.id} style={{ paddingLeft: 35 }}>
                  <CommentRow c={r} post={post} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {!hidden && <CommentInput post={post} replyTo={replyTo} onClearReply={() => setReplyTo(null)} inputRef={inputRef} />}
    </KeyboardAvoidingView>
  );
}

/** 본문 전체 · 태그 · 투표 카드 · 기록 카드 · 코스 · 반응. */
function PostContent({ post, stops }: { post: BoardPost; stops: Parameters<typeof CourseBlock>[0]["stops"] }) {
  const hasRecord = !!post.place_name && post.type !== "course";
  return (
    <>
      {!!postTitle(post) && <Text style={{ fontFamily: F.serif, fontSize: 20, lineHeight: 28, color: C.ink }}>{postTitle(post)}</Text>}
      {!!post.body && <Text selectable style={{ fontFamily: F.serif, fontSize: 13.5, lineHeight: 23, color: K.text2 }}>{post.body}</Text>}
      <Tags tags={post.tags} />
      {post.type === "free" && !!post.poll_closes_at && (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 12 }}>
          <PollOptions post={post} />
        </View>
      )}
      {hasRecord && (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 12 }}>
          <RecordMini name={post.place_name} photo={postPhoto(post)} rating={post.rating} category={post.category} address={post.address} verifiedAt={post.verified ? post.verified_at : null} />
        </View>
      )}
      {post.type === "course" && <CourseBlock post={post} stops={stops} />}
      <Reactions post={post} stops={stops} />
    </>
  );
}

/** 댓글 한 줄 — 아바타 26 · 닉네임 · 시간 · 본문 12.5 · (기록) · 「답글」. 숨긴 댓글은 작성자 줄을 두고 본문만 바꿉니다. */
function CommentRow({ c, post, onReply }: { c: BoardComment; post: BoardPost; onReply?: () => void }) {
  const hidden = !!c.hidden_at && c.body == null;
  const photo = c.record_id ? coverPhoto({ photo_urls: c.photo_urls ?? [], cover_index: c.cover_index ?? 0, photo_url: c.photo_url }) : null;
  return (
    <View style={{ paddingVertical: 11, gap: 6 }}>
      <AuthorRow
        size={26} userId={c.author_id} name={c.nickname} url={c.avatar_url} titleId={c.title_label_id} role={c.author_role}
        time={timeAgo(c.created_at)}
        badge={c.author_id === post.author_id ? (
          <Text style={{ borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, fontFamily: F.sans, fontSize: 9.5, color: C.muted, overflow: "hidden" }}>글쓴이</Text>
        ) : undefined}
        more={<MoreButton target={{ kind: "comment", comment: c }} />}
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

/** 입력줄 — 왼쪽 「+」(내 기록 붙이기) + 「댓글 달기」 500자. 문턱(5건)은 없습니다. */
function CommentInput({ post, replyTo, onClearReply, inputRef }: { post: BoardPost; replyTo: BoardComment | null; onClearReply: () => void; inputRef: React.RefObject<TextInput | null> }) {
  const qc = useQueryClient();
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
      await addBoardComment(qc, { postId: post.id, body: text, parentId: replyTo?.id ?? null, recordId: record?.id ?? null });
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
        <Pressable onPress={() => setPicking(true)} accessibilityLabel="내 기록 붙이기" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 19, color: C.muted, marginTop: -2 }}>+</Text>
        </Pressable>
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
      <RecordPickerSheet visible={picking} onClose={() => setPicking(false)} onPick={([r]) => setRecord(r ?? null)} title="댓글에 내 기록 붙이기" />
    </View>
  );
}


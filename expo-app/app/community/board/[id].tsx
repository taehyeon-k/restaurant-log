import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addBoardComment, useBoardComments, useBoardPost, useCourseStops, useCurrentTheme, useIsAdmin, type BoardComment, type BoardPost,
} from "@/features/community/api";
import {
  AuthorRow, boardPill, CourseBlock, PollOptions, postPhoto, postTitle, Reactions, RecordMini, Tags,
} from "@/features/community/BoardPost";
import { MoreButton } from "@/features/community/ItemMenu";
import { CommentInput, CommentRow } from "@/features/community/CommentThread";
import { K, Pill, timeAgo } from "@/features/community/ui";
import { C, F } from "@/theme";

const HIDDEN_POST = "운영 정책에 따라 삭제된 글입니다.";

/** 글 상세 · 댓글(HANDOFF-board-v2 07) — 본문 전체 · 태그 · 투표 / 기록 / 코스 · 반응, 댓글은 시간순 · 답글 한 단계. */
export default function BoardPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
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
              <CommentRow c={c} ownerId={post.author_id} target={{ kind: "comment", comment: c }} onReply={() => { setReplyTo(c); inputRef.current?.focus(); }} />
              {c.replies.map((r) => (
                <View key={r.id} style={{ paddingLeft: 35 }}>
                  <CommentRow c={r} ownerId={post.author_id} target={{ kind: "comment", comment: r }} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {!hidden && (
        <CommentInput
          allowRecord
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          inputRef={inputRef}
          onSend={(p) => addBoardComment(qc, { postId: post.id, ...p })}
        />
      )}
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

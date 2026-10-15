import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { useAccount } from "@/data/profile";
import { useRows } from "@/data/queries";
import { answerPost, blockUser, report, useAnswers, useBoardPost, useCurrentTheme, type AnswerGroup, type BoardPost } from "@/features/community/api";
import { useAddWish } from "@/features/community/useAddWish";
import { askTitle, AuthorRow, Cond, myVerifiedAt, PostBody, TYPE_LABEL } from "@/features/community/BoardPost";
import { CommunityHeader, K, metaLine, Pill, shortAddr, TagChip, timeAgo } from "@/features/community/ui";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

/** 글 하나(3f) — 어디 가요? 는 가게 답을 가게별로 묶어 보여 주고, 가 본 사람만 답합니다. */
export default function BoardPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: post } = useBoardPost(postId);
  const { data: rows = [] } = useRows();
  const { data: theme } = useCurrentTheme();
  const [answering, setAnswering] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/community/board"));

  function menu() {
    if (!post) return;
    Alert.alert("신고", undefined, [
      {
        text: "이 글 신고하기",
        onPress: () => Alert.alert("무엇이 문제인가요?", undefined, [
          ...["광고 · 홍보", "불쾌한 내용", "인증과 다른 가게", "기타"].map((reason) => ({
            text: reason,
            onPress: () => report("post", post.id, reason).then(() => Alert.alert("신고했습니다", "살펴본 뒤 처리합니다.")).catch(() => {}),
          })),
          { text: "취소", style: "cancel" as const },
        ]),
      },
      {
        text: `${post.nickname ?? "이 사람"}의 글 숨기기`,
        style: "destructive",
        onPress: () => blockUser(qc, post.author_id).then(back).catch(() => {}),
      },
      { text: "취소", style: "cancel" },
    ]);
  }

  const header = <CommunityHeader back={{ label: "‹ 게시판", onPress: back }} right={<Pill label="신고" onPress={menu} />} />;

  if (!post) {
    return <View style={{ flex: 1, backgroundColor: C.paper }}>{header}</View>;
  }

  if (post.type !== "ask") {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        {header}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <PostBody post={post} rows={rows} themeTitle={post.theme_id === theme?.id ? theme?.title : null} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      {header}
      <AskAnswers post={post} rows={rows} onAnswer={() => setAnswering(true)} />
      <AnswerSheet post={post} rows={rows} visible={answering} onClose={() => setAnswering(false)} />
    </View>
  );
}

function AskAnswers({ post, rows, onAnswer }: { post: BoardPost; rows: Restaurant[]; onAnswer: () => void }) {
  const { data: groups = [] } = useAnswers(post.id);
  const canAnswer = rows.some((r) => r.verified && !r.pending);
  return (
    <>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.place}
        contentContainerStyle={{ paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View>
            <View style={{ paddingTop: 16, paddingHorizontal: 20, gap: 9 }}>
              <TagChip label={TYPE_LABEL.ask} />
              <AuthorRow
                name={post.nickname ?? ""} url={post.avatar_url} seed={post.author_id} titleId={post.title_label_id}
                right={<Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(post.created_at)}</Text>}
              />
              <Text style={{ fontFamily: F.serif, fontSize: 19, lineHeight: 27, color: C.ink }}>{askTitle(post.ask_area, post.ask_tags)}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[post.ask_area, ...post.ask_tags].filter(Boolean).map((t) => <Cond key={t} label={t!} />)}
              </View>
              {!!post.note && <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: K.text2 }}>{post.note}</Text>}
            </View>
            <View style={{ marginTop: 16, marginHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>가게 답 {groups.reduce((n, g) => n + g.picks, 0)}</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>가 본 사람만 답할 수 있어요</Text>
            </View>
            <View style={{ height: 10 }} />
          </View>
        }
        ListEmptyComponent={<Text style={{ paddingVertical: 30, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 답이 없습니다.</Text>}
        renderItem={({ item }) => <View style={{ paddingHorizontal: 16 }}><AnswerCard group={item} post={post} rows={rows} /></View>}
      />
      <Pressable
        onPress={onAnswer}
        disabled={!canAnswer}
        style={{ position: "absolute", left: 16, right: 16, bottom: 22, minHeight: 48, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: canAnswer ? 1 : 0.4, shadowColor: C.ink, shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>가 본 가게로 답하기</Text>
      </Pressable>
    </>
  );
}

/** 같은 가게를 고른 답 하나로 — N명이 고름, 처음 답한 사람과 그 이유. */
function AnswerCard({ group, post, rows }: { group: AnswerGroup; post: BoardPost; rows: Restaurant[] }) {
  const qc = useQueryClient();
  const a = group.first;
  const mine = myVerifiedAt(rows, a.place, a.place_name);
  const { data: account } = useAccount();
  const already = group.answers.some((x) => x.author_id === account?.userId);
  const [wish, setWish] = useState<"idle" | "added" | "exists">("idle");
  const [busy, setBusy] = useState(false);
  const { add: addWish, sheet: wishSheet } = useAddWish();

  async function metoo() {
    if (!mine || busy) return;
    setBusy(true);
    try {
      await answerPost(qc, post.id, mine.id, "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { Alert.alert("답하지 못했습니다", e instanceof Error ? e.message : ""); }
    setBusy(false);
  }

  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{a.place_name}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{metaLine(a.category, shortAddr(a.address, null).split(" ").slice(1).join(" "))}</Text>
        </View>
        <Text style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8, paddingVertical: 1, fontFamily: F.mono, fontSize: 10, color: C.brick, overflow: "hidden" }}>{group.picks}명이 고름</Text>
      </View>
      <AuthorRow
        size={20} name={a.nickname ?? ""} url={a.avatar_url} seed={a.author_id} titleId={a.title_label_id}
        right={<Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>✓ 인증</Text>}
      />
      {!!a.reason && <Text style={{ fontFamily: F.serif, fontSize: 12.5, lineHeight: 20, color: K.text2 }}>{a.reason}</Text>}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable
          disabled={wish !== "idle"}
          onPress={async () => {
            const res = await addWish({ name: a.place_name, where_text: a.address, category: a.category, lat: a.lat, lng: a.lng, source: `${a.nickname ?? "게시판"}의 기록` }).catch(() => null);
            if (res) setWish(res);
          }}
          style={{ minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: K.brickLine, paddingHorizontal: 10, justifyContent: "center", backgroundColor: wish === "idle" ? "transparent" : C.brickSoft }}
        >
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>{wish === "added" ? "✓ 위시에 담음" : wish === "exists" ? "이미 담아둔 곳" : "+ 위시에 담기"}</Text>
        </Pressable>
        <Pressable
          onPress={metoo}
          disabled={!mine || busy || already}
          accessibilityHint={mine ? undefined : "이 가게의 인증 기록이 있을 때 누를 수 있습니다"}
          style={{ minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, paddingHorizontal: 10, justifyContent: "center", opacity: mine && !already ? 1 : 0.45 }}
        >
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>나도 이 집</Text>
        </Pressable>
      </View>
      {wishSheet}
    </View>
  );
}

/** 가 본 가게로 답하기 — 내 인증 기록 하나 + 한 줄 이유(60자). */
function AnswerSheet({ post, rows, visible, onClose }: { post: BoardPost; rows: Restaurant[]; visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verified = useMemo(() => {
    // 같은 가게는 한 번만, 묻는 동네의 가게를 위로.
    const seen = new Set<string>();
    const list = rows.filter((r) => r.verified && !r.pending).filter((r) => {
      const k = r.place_key ?? r.name;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const area = post.ask_area ?? "";
    return list.sort((a, b) => Number((b.address ?? "").includes(area)) - Number((a.address ?? "").includes(area)));
  }, [rows, post.ask_area]);

  async function send() {
    if (pick == null || busy) return;
    setBusy(true);
    setError("");
    try {
      await answerPost(qc, post.id, pick, reason);
      setPick(null);
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "답하지 못했습니다");
    }
    setBusy(false);
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>가 본 가게로 답하기</Text>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>내가 인증한 가게만 고를 수 있습니다</Text>
      <FlatList
        style={{ marginTop: 10, maxHeight: 280 }}
        data={verified}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item: r }) => {
          const on = r.id === pick;
          return (
            <Pressable onPress={() => setPick(r.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#ece8de" }}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{r.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>{metaLine(r.category, r.region)}</Text>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.brick : "transparent", borderWidth: on ? 0 : 1.5, borderColor: K.dashed }}>
                {on && <Text style={{ fontSize: 11, color: C.card }}>✓</Text>}
              </View>
            </Pressable>
          );
        }}
      />
      <View style={{ marginTop: 12, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput value={reason} onChangeText={(t) => setReason(t.slice(0, 60))} placeholder="한 줄 이유" placeholderTextColor={K.inactive} style={{ flex: 1, paddingVertical: 12, fontFamily: F.sans, fontSize: 12.5, color: C.ink }} />
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{reason.length} / 60</Text>
      </View>
      {!!error && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}
      <Pressable onPress={send} disabled={pick == null || busy} style={{ marginTop: 12, minHeight: 48, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: pick == null || busy ? 0.4 : 1 }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>답하기</Text>
      </Pressable>
    </BottomSheetModal>
  );
}

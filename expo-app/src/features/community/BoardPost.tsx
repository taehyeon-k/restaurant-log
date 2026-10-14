import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { norm } from "@/lib/geo";
import { regionFromAddress } from "@/lib/regions";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { addWishFrom, setReaction, type BoardPost } from "./api";
import { Avatar, K, metaLine, monthDay, PhotoOrStripes, shortAddr, TagChip, timeAgo, TitleChip } from "./ui";

export const TYPE_LABEL = { record_share: "기록 나눔", theme_answer: "주제", ask: "어디 가요?" } as const;

/** 어디 가요? 제목 — 고른 동네 · 상황 · 시간으로 만듭니다. "성수동에서 혼밥, 20시 이후" */
export const askTitle = (area: string | null, tags: string[]) => `${area ?? ""}에서 ${tags.join(", ")}`.trim();

/** "서울 성동구" → "성동구" */
export const guLabel = (gu: string) => gu.split(" ").pop() ?? gu;
export const guOf = (address: string | null | undefined) => regionFromAddress(address) || null;

/** 내 인증 기록 중 그 가게의 것 — 「가봤어요」 · 「나도 이 집」에 씁니다. */
export function myVerifiedAt(rows: Restaurant[], place: string | null, name: string | null) {
  if (!place && !name) return null;
  return rows.find((r) => r.verified && !r.pending && ((r.place_key && r.place_key === place) || (name && norm(r.name) === norm(name)))) ?? null;
}

/** 글쓴이 줄 — 얼굴 · 이름 · 칭호 · 때. */
export function AuthorRow({ name, url, seed, titleId, right, size = 24 }: { name: string; url: string | null; seed: string; titleId: string | null; right?: React.ReactNode; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <Avatar name={name} url={url} size={size} seed={seed} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sansMd, fontSize: size < 24 ? 11.5 : 12, color: C.ink }}>{name}</Text>
      <TitleChip id={titleId} />
      {right}
    </View>
  );
}

/** 반응은 둘뿐 — 「가보고 싶어요」(위시에도 담김) · 「가봤어요」(그 가게 인증 기록이 있을 때만). 좋아요 수는 없습니다. */
export function Reactions({ post, beenOk }: { post: BoardPost; beenOk: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function want() {
    if (busy) return;
    setBusy(true);
    Haptics.selectionAsync();
    try {
      await setReaction(qc, post.id, "want", !post.my_want);
      if (!post.my_want && post.place_name) {
        await addWishFrom(qc, { name: post.place_name, where_text: post.address, category: post.category, lat: post.lat, lng: post.lng, source: `${post.nickname ?? "게시판"}의 기록` });
      }
    } catch (e) { Alert.alert("잠시 뒤 다시 해 주세요", e instanceof Error ? e.message : ""); }
    setBusy(false);
  }
  async function been() {
    if (busy || !beenOk) return;
    setBusy(true);
    Haptics.selectionAsync();
    try { await setReaction(qc, post.id, "been", !post.my_been); } catch {}
    setBusy(false);
  }

  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <Pressable onPress={want} style={{ minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: K.brickLine, paddingHorizontal: 10, justifyContent: "center", backgroundColor: post.my_want ? C.brickSoft : "transparent" }}>
        <Text style={{ fontFamily: post.my_want ? F.sansMd : F.sans, fontSize: 11, color: C.brick }}>가보고 싶어요 {post.want_count}</Text>
      </Pressable>
      <Pressable
        onPress={been}
        disabled={!beenOk}
        accessibilityHint={beenOk ? undefined : "이 가게의 인증 기록이 있을 때 누를 수 있습니다"}
        style={{ minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: post.my_been ? C.ink : C.lineSoft, paddingHorizontal: 10, justifyContent: "center", opacity: beenOk ? 1 : 0.5 }}
      >
        <Text style={{ fontFamily: post.my_been ? F.sansMd : F.sans, fontSize: 11, color: post.my_been ? C.ink : C.muted }}>가봤어요 {post.been_count}</Text>
      </Pressable>
    </View>
  );
}

/** 게시판 글 하나 — 기록 나눔 · 주제 답은 기록 덩어리, 어디 가요? 는 조건 칩 + 가게 답 요약. */
export function PostBody({ post, rows, themeTitle, onOpen }: { post: BoardPost; rows: Restaurant[]; themeTitle?: string | null; onOpen?: () => void }) {
  const tag = post.type === "theme_answer" && themeTitle ? `주제 · ${themeTitle}` : TYPE_LABEL[post.type];
  const author = (
    <AuthorRow
      name={post.nickname ?? ""}
      url={post.avatar_url}
      seed={post.author_id}
      titleId={post.title_label_id}
      right={<Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(post.created_at)}</Text>}
    />
  );

  if (post.type === "ask") {
    return (
      <Pressable onPress={onOpen} disabled={!onOpen} style={{ gap: 9 }}>
        <TagChip label={tag} />
        {author}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[post.ask_area, ...post.ask_tags].filter(Boolean).map((t) => <Cond key={t} label={t!} />)}
        </View>
        {!!post.note && <Text style={{ fontFamily: F.sans, fontSize: 12, color: K.text2 }}>{post.note}</Text>}
        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>
          가게 답 {post.answer_count}
          {post.top_answer ? <Text> · 가장 많이 고른 곳 <Text style={{ fontFamily: F.sansMd, color: C.ink }}>{post.top_answer}</Text></Text> : null}
        </Text>
      </Pressable>
    );
  }

  const beenOk = !!myVerifiedAt(rows, post.place, post.place_name);
  const photo = coverPhoto({ photo_urls: post.photo_urls ?? [], cover_index: post.cover_index ?? 0, photo_url: post.photo_url });
  return (
    <View style={{ gap: 9 }}>
      <Pressable onPress={onOpen} disabled={!onOpen} style={{ gap: 9 }}>
        <TagChip label={tag} />
        {author}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <PhotoOrStripes uri={photo} width={60} height={60} radius={12} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 15, color: C.ink }}>{post.place_name}</Text>
              {post.rating != null && <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>★ {post.rating}</Text>}
            </View>
            <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{metaLine(post.category, shortAddr(post.address, null))}</Text>
            {!!post.verified_at && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>✓ 인증 {monthDay(post.verified_at)}</Text>}
          </View>
        </View>
        {!!post.note && <Text style={{ fontFamily: F.serif, fontSize: 12.5, lineHeight: 21, color: K.text2 }}>{post.note}</Text>}
      </Pressable>
      <Reactions post={post} beenOk={beenOk} />
    </View>
  );
}

export const Cond = ({ label }: { label: string }) => (
  <Text style={{ borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 9, paddingVertical: 2, fontFamily: F.sans, fontSize: 11.5, color: K.text2, overflow: "hidden" }}>{label}</Text>
);

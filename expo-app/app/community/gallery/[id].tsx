import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatIcon, HeartIcon } from "@/components/icons";
import {
  addGalleryComment, setGalleryLike, useGalleryComments, useGalleryPhoto, useIsAdmin, type GalleryComment,
} from "@/features/community/api";
import { StaffAvatar } from "@/features/community/BoardPost";
import { CommentInput, CommentRow } from "@/features/community/CommentThread";
import { MoreButton } from "@/features/community/ItemMenu";
import { useOpenProfile } from "@/features/community/ProfileSheet";
import { useAddWish } from "@/features/community/useAddWish";
import { Avatar, K, metaLine, monthDay, Pill, timeAgo } from "@/features/community/ui";
import { SignedImage } from "@/lib/signedPhoto";
import { C, F } from "@/theme";

const DOUBLE_TAP_MS = 280;

/** 사진 보기(HANDOFF-gallery 02) — 사진 · 좋아요(두 번 탭) · 위시에 담기 · 가게 카드 · 한 줄 · 댓글. */
export default function GalleryPhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const photoId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openProfile = useOpenProfile();
  const { data: photo, isLoading } = useGalleryPhoto(photoId);
  const { data: isAdmin } = useIsAdmin();
  const { data: comments = [] } = useGalleryComments(photoId);
  const { add: addWish, sheet: wishSheet } = useAddWish();
  const [replyTo, setReplyTo] = useState<GalleryComment | null>(null);
  const [allComments, setAllComments] = useState(false);
  const [wish, setWish] = useState<"idle" | "added" | "exists">("idle");
  const inputRef = useRef<TextInput>(null);

  // 좋아요는 누르는 즉시 바뀌게 — 서버 값이 오면 맞춥니다.
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  useEffect(() => { if (photo) { setLiked(photo.my_like); setLikes(photo.like_count); } }, [photo?.my_like, photo?.like_count]); // eslint-disable-line react-hooks/exhaustive-deps

  const heart = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/community/gallery"));

  async function toggleLike(on: boolean) {
    if (!photo || on === liked) return;
    Haptics.selectionAsync();
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    try { await setGalleryLike(qc, photo.id, on); } catch (e) {
      setLiked(!on);
      setLikes((n) => n + (on ? -1 : 1));
      Alert.alert("잠시 뒤 다시 해 주세요", e instanceof Error ? e.message : "");
    }
  }

  /** 두 번 탭 — 좋아요(이미 눌렀으면 그대로) + 하트가 잠깐 떠오름. */
  function tapPhoto() {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.timing(heart, { toValue: 0, duration: 260, delay: 380, useNativeDriver: true }),
      ]).start();
      void toggleLike(true);
    } else lastTap.current = now;
  }

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 9 }}>
      <Pill onPress={back} accessibilityLabel="갤러리로" label="‹" />
      {photo && (
        <Pressable onPress={() => openProfile(photo.author_id)} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }} accessibilityLabel={`${photo.nickname} 프로필`}>
          {photo.author_role === "admin" ? <StaffAvatar size={30} /> : <Avatar name={photo.nickname ?? ""} url={photo.avatar_url} size={30} seed={photo.author_id} />}
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{photo.author_role === "admin" ? "DINARY 운영" : photo.nickname}</Text>
        </Pressable>
      )}
      {photo && <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(photo.created_at)}</Text>}
      <View style={{ flex: 1 }} />
      {photo && <MoreButton target={{ kind: "gallery_photo", photo }} onDeleted={back} onBlocked={back} />}
    </View>
  );

  if (!photo || (photo.hidden_at && !isAdmin)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        {header}
        <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>
          {isLoading ? "" : photo?.hidden_at ? "운영 정책에 따라 내려간 사진입니다." : "내려갔거나 볼 수 없는 사진입니다."}
        </Text>
      </View>
    );
  }

  const count = comments.reduce((n, c) => n + 1 + c.replies.length, 0);
  // 미리보기는 최근 2개(답글 포함, 시간순).
  const flat = comments.flatMap((c) => [c, ...c.replies]).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const preview = flat.slice(-2);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={tapPhoto} accessibilityLabel="사진 · 두 번 누르면 좋아요" style={{ width, height: width, backgroundColor: "#ece7dc" }}>
          <SignedImage uri={photo.photo_ref} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}
          >
            <HeartIcon size={96} stroke={C.card} fill={C.card} strokeWidth={1} />
          </Animated.View>
          {photo.hidden_at && <Text style={{ position: "absolute", left: 10, top: 10, borderRadius: 8, backgroundColor: C.brick, paddingHorizontal: 7, fontFamily: F.mono, fontSize: 10, color: C.card, overflow: "hidden" }}>숨긴 사진 · 운영자에게만</Text>}
        </Pressable>

        {/* 반응 줄 — ♡/♥ + 수 · 말풍선 + 댓글 수 · 「+ 위시에 담기」 */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable onPress={() => toggleLike(!liked)} hitSlop={8} accessibilityLabel={liked ? "좋아요 취소" : "좋아요"} accessibilityState={{ selected: liked }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <HeartIcon stroke={liked ? C.brick : C.ink} fill={liked ? C.brick : "none"} />
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: liked ? C.brick : C.ink }}>{likes}</Text>
          </Pressable>
          <Pressable onPress={() => { setAllComments(true); inputRef.current?.focus(); }} hitSlop={8} accessibilityLabel="댓글" style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <ChatIcon stroke={C.ink} />
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{count}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            disabled={wish !== "idle"}
            onPress={async () => {
              const res = await addWish({ name: photo.place_name, where_text: photo.address, category: photo.category, lat: photo.lat, lng: photo.lng, source: `${photo.nickname ?? "갤러리"}의 사진` }).catch(() => null);
              if (res) setWish(res);
            }}
            style={{ minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: K.brickLine, paddingHorizontal: 12, justifyContent: "center", backgroundColor: wish === "idle" ? "transparent" : C.brickSoft }}
          >
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{wish === "added" ? "✓ 위시에 담음" : wish === "exists" ? "이미 담아둔 곳" : "+ 위시에 담기"}</Text>
          </Pressable>
        </View>

        {/* 가게 카드 — 누르면 그 가게 사진 모아보기 */}
        <Pressable
          onPress={() => router.push({ pathname: "/community/gallery/list", params: { place: photo.place, title: photo.place_name } })}
          style={{ marginTop: 14, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 12, paddingHorizontal: 14, gap: 3 }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.serif, fontSize: 16, color: C.ink }}>{photo.place_name}</Text>
            {photo.verified && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>✓ 인증 {monthDay(photo.verified_at)}</Text>}
          </View>
          {!!photo.menu && <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: K.text2 }}>{photo.menu}</Text>}
          <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{metaLine(photo.category, photo.area)} · 이 가게 사진 ›</Text>
        </Pressable>

        {!!photo.caption && <Text selectable style={{ marginTop: 12, marginHorizontal: 18, fontFamily: F.serif, fontSize: 13.5, lineHeight: 22, color: K.text2 }}>{photo.caption}</Text>}

        {/* 댓글 — 「모두 보기」 전에는 최근 2개만 */}
        <View style={{ marginTop: 16, marginHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
          {!allComments ? (
            <View style={{ gap: 7 }}>
              {count > 0 && (
                <Pressable onPress={() => setAllComments(true)} hitSlop={6}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>댓글 {count}개 모두 보기</Text>
                </Pressable>
              )}
              {preview.map((c) => (
                <Text key={c.id} numberOfLines={2} style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: K.text2 }}>
                  <Text style={{ fontFamily: F.sansBd, color: C.ink }}>{c.author_role === "admin" ? "DINARY 운영" : c.nickname} </Text>
                  {c.body ?? <Text style={{ color: K.inactive }}>운영 정책에 따라 삭제된 댓글입니다.</Text>}
                </Text>
              ))}
              {count === 0 && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>첫 댓글을 남겨 보세요.</Text>}
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.ink }}>댓글 {count}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>시간순</Text>
              </View>
              {comments.map((c) => (
                <View key={c.id}>
                  <CommentRow c={c} ownerId={photo.author_id} target={{ kind: "gallery_comment", comment: c }} onReply={() => { setReplyTo(c); inputRef.current?.focus(); }} />
                  {c.replies.map((r) => (
                    <View key={r.id} style={{ paddingLeft: 35 }}>
                      <CommentRow c={r} ownerId={photo.author_id} target={{ kind: "gallery_comment", comment: r }} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {!photo.hidden_at && (
        <CommentInput
          allowRecord={false}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          inputRef={inputRef}
          onSend={async (p) => { await addGalleryComment(qc, { photoId: photo.id, body: p.body, parentId: p.parentId }); setAllComments(true); }}
        />
      )}
      {wishSheet}
    </KeyboardAvoidingView>
  );
}

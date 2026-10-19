import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Character } from "@/components/Character";
import { acceptFriend, getProfile, removeFriend, requestFriend, searchPeople, useFriends, type PublicProfile } from "@/features/community/api";
import { Avatar, CommunityHeader, K, TitleBlock, TitleChip } from "@/features/community/ui";
import { C, F, TAB_BAR_H } from "@/theme";

/**
 * 친구 추가 · 받은 신청(핸드오프 §5 「Add friend」) — 닉네임 검색 · 초대 링크 · 카카오 친구 불러오기.
 * 초대 링크(dinary://community/people?invite=<id>)로 들어오면 그 사람이 맨 위에 뜹니다.
 */
export default function PeopleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { invite } = useLocalSearchParams<{ invite?: string; tab?: string }>();
  const { data: fr } = useFriends();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PublicProfile[]>([]);
  const [invited, setInvited] = useState<PublicProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (invite) getProfile(invite).then(setInvited);
  }, [invite]);

  useEffect(() => {
    const t = setTimeout(() => { searchPeople(q).then(setFound); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const status = (id: string) =>
    id === fr?.me ? "me" : fr?.friends.some((p) => p.id === id) ? "friend" : fr?.incoming.some((p) => p.id === id) ? "incoming" : fr?.outgoing.some((p) => p.id === id) ? "outgoing" : "none";

  async function act(id: string, f: () => Promise<void>) {
    setBusy(id);
    try { await f(); } catch (e) { Alert.alert("잠시 뒤 다시 해 주세요", e instanceof Error ? e.message : ""); }
    setBusy(null);
  }

  function shareInvite() {
    if (!fr?.me) return;
    const url = Linking.createURL("/community/people", { queryParams: { invite: fr.me } });
    Share.share({ message: `DINARY 에서 친구해요 — ${url}` });
  }

  const row = (p: PublicProfile, right: React.ReactNode) => (
    <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
      <Avatar name={p.nickname} url={p.avatarUrl} size={36} seed={p.id} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{p.nickname}</Text>
          <Character id={p.characterId} size={20} />
        </View>
        <View style={{ flexDirection: "row" }}><TitleChip id={p.titleLabelId} /></View>
      </View>
      {right}
    </View>
  );

  const btn = (label: string, onPress: () => void, dark?: boolean, id?: string) => (
    <Pressable onPress={onPress} disabled={busy === id} style={{ minHeight: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center", backgroundColor: dark ? C.ink : "transparent", borderWidth: dark ? 0 : 1, borderColor: C.line, opacity: busy === id ? 0.5 : 1 }}>
      <Text style={{ fontFamily: dark ? F.sansMd : F.sans, fontSize: 11.5, color: dark ? C.card : C.muted }}>{label}</Text>
    </Pressable>
  );

  const action = (p: PublicProfile) => {
    switch (status(p.id)) {
      case "me": return null;
      case "friend": return <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>친구</Text>;
      case "incoming": return btn("받기", () => act(p.id, () => acceptFriend(qc, p.id)), true, p.id);
      case "outgoing": return btn("신청함 · 취소", () => act(p.id, () => removeFriend(qc, p.id)), false, p.id);
      default: return btn("친구 신청", () => act(p.id, () => requestFriend(qc, p.id)), true, p.id);
    }
  };

  const section = (title: string) => (
    <Text style={{ marginTop: 22, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>{title}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader back={{ label: "친구", onPress: () => (router.canGoBack() ? router.back() : router.navigate("/community/friends")) }} />
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_H + insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <TitleBlock eyebrow="COMMUNITY · FRIENDS" title="친구 추가" />
        <View style={{ paddingHorizontal: 20 }}>
          {invited && status(invited.id) !== "me" && (
            <>
              {section("초대한 사람")}
              {row(invited, action(invited))}
            </>
          )}

          {(fr?.incoming.length ?? 0) > 0 && (
            <>
              {section(`받은 신청 · ${fr!.incoming.length}`)}
              {fr!.incoming.map((p) => row(p, (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {btn("거절", () => act(p.id, () => removeFriend(qc, p.id)), false, p.id)}
                  {btn("받기", () => act(p.id, () => acceptFriend(qc, p.id)), true, p.id)}
                </View>
              )))}
            </>
          )}

          {section("닉네임 검색")}
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="닉네임"
            placeholderTextColor={K.inactive}
            autoCapitalize="none"
            style={{ marginTop: 8, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card, paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13.5, color: C.ink }}
          />
          {found.map((p) => row(p, action(p)))}
          {!!q.trim() && found.length === 0 && <Text style={{ paddingVertical: 14, fontFamily: F.sans, fontSize: 12, color: C.faint }}>그 닉네임을 찾지 못했습니다.</Text>}

          {section("다른 방법")}
          <View style={{ marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
            <Pressable onPress={shareInvite} style={{ minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>초대 링크 보내기</Text>
              <Text style={{ fontSize: 13, color: C.faint }}>›</Text>
            </Pressable>
            <View style={{ minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.lineSoft }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.faint }}>카카오 친구 불러오기</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: K.inactive }}>준비 중</Text>
            </View>
          </View>

          {(fr?.friends.length ?? 0) > 0 && (
            <>
              {section(`친구 · ${fr!.friends.length}`)}
              {fr!.friends.map((p) => row(p, btn("끊기", () => Alert.alert("친구 끊기", `${p.nickname}님과 친구를 끊을까요?`, [
                { text: "취소", style: "cancel" },
                { text: "끊기", style: "destructive", onPress: () => act(p.id, () => removeFriend(qc, p.id)) },
              ]), false, p.id)))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

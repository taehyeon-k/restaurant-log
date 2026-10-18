import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Character } from "@/components/Character";
import { BottomSheetModal } from "@/components/ui";
import { characterOf, DEFAULT_CHARACTER, isCharacterId, RARITY } from "@/lib/characters";
import { C, F } from "@/theme";
import {
  acceptFriend, adminRankBan, adminRankUnban, adminSanction, adminUnsanction, removeFriend, requestFriend, useIsAdmin, useProfileCard, type ProfileCard,
} from "./api";
import { K, titleName } from "./ui";

/**
 * 프로필 창(HANDOFF-board-v2 §08) — 글 · 댓글 · 코스의 닉네임이나 얼굴을 누르면 아래에서 올라옵니다.
 * 게시판 묶음(board/_layout)이 Provider 를 두르고, AuthorRow 가 useOpenProfile 로 엽니다.
 */
const Ctx = createContext<(userId: string) => void>(() => {});
export const useOpenProfile = () => useContext(Ctx);

export function ProfileSheetProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const open = useCallback((id: string) => { Haptics.selectionAsync(); setUserId(id); }, []);
  return (
    <Ctx.Provider value={open}>
      {children}
      <ProfileSheet userId={userId} onClose={() => setUserId(null)} />
    </Ctx.Provider>
  );
}

function ProfileSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { data: card, isLoading } = useProfileCard(userId);
  return (
    <BottomSheetModal visible={!!userId} onClose={onClose}>
      {card ? (
        <CardBody card={card} onClose={onClose} />
      ) : (
        <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>
          {isLoading ? "불러오는 중…" : "볼 수 없는 프로필입니다."}
        </Text>
      )}
    </BottomSheetModal>
  );
}

function CardBody({ card, onClose }: { card: ProfileCard; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: isAdmin } = useIsAdmin();
  const [busy, setBusy] = useState(false);
  const charId = isCharacterId(card.character_id) ? card.character_id : DEFAULT_CHARACTER;
  const ch = characterOf(charId);
  const title = titleName(card.title_label_id);
  const staff = card.role === "admin";

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["community", "profile-card", card.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("잠시 뒤 다시 해 주세요", e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }

  const button = useMemo(() => {
    switch (card.friend_state) {
      case "none": return { label: "+ 친구 추가", dark: true, onPress: () => run(() => requestFriend(qc, card.id)) };
      case "sent": return { label: "친구 요청 보냄 · 취소", dark: false, onPress: () => run(() => removeFriend(qc, card.id)) };
      case "received": return { label: "친구 요청 받기", dark: true, onPress: () => run(() => acceptFriend(qc, card.id)) };
      case "friend": return { label: "친구 · 기록 보기", dark: false, onPress: () => { onClose(); router.push({ pathname: "/community/friends", params: { only: card.id } }); } };
      default: return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.friend_state, card.id]);

  function sanction() {
    const until = card.sanctioned_until;
    Alert.alert(`${card.nickname} 정지`, until ? `지금 정지 중 · ${until === "forever" ? "영구" : `${until.slice(0, 10)}까지`}` : "글 · 댓글 쓰기만 막습니다. 기록장은 그대로입니다.", [
      { text: "7일", onPress: () => run(() => adminSanction(qc, card.id, 7)) },
      { text: "30일", onPress: () => run(() => adminSanction(qc, card.id, 30)) },
      { text: "영구", style: "destructive", onPress: () => run(() => adminSanction(qc, card.id, null)) },
      ...(until ? [{ text: "정지 풀기", onPress: () => run(() => adminUnsanction(qc, card.id)) }] : []),
      { text: "취소", style: "cancel" as const },
    ]);
  }

  /** 랭킹 정지 · 제외 — 기록장 · 게시판은 그대로, 랭킹에만 안 나옵니다. */
  function rankBan() {
    const until = card.rank_banned_until;
    Alert.alert(`${card.nickname} 랭킹`, until ? `지금 랭킹 정지 중 · ${until === "forever" ? "영구 제외" : `${until.slice(0, 10)}까지`}` : "부정한 기록이 의심되면 랭킹에서만 뺍니다.", [
      { text: "랭킹 7일 정지", onPress: () => run(() => adminRankBan(qc, card.id, 7, "부정 기록 의심")) },
      { text: "랭킹 30일 정지", onPress: () => run(() => adminRankBan(qc, card.id, 30, "부정 기록 의심")) },
      { text: "랭킹에서 영구 제외", style: "destructive", onPress: () => run(() => adminRankBan(qc, card.id, null, "부정 기록 의심")) },
      ...(until ? [{ text: "랭킹 정지 풀기", onPress: () => run(() => adminRankUnban(qc, card.id)) }] : []),
      { text: "취소", style: "cancel" as const },
    ]);
  }

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: staff ? C.ink : C.brickSoft, borderWidth: 1, borderColor: staff ? C.ink : K.brickLine, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {staff ? <Text style={{ fontFamily: F.serif, fontSize: 34, color: C.card }}>D</Text> : <Character id={charId} size={64} />}
      </View>
      <Text style={{ marginTop: 12, fontFamily: F.serif, fontSize: 21, color: C.ink }}>{staff ? "DINARY 운영" : card.nickname}</Text>
      {!!title && !staff && (
        <Text style={{ marginTop: 7, borderRadius: 11, backgroundColor: "rgba(180,85,45,.1)", paddingHorizontal: 10, paddingVertical: 3, fontFamily: F.sansBd, fontSize: 11, color: C.brick, overflow: "hidden" }}>{title}</Text>
      )}
      {!staff && <Text style={{ marginTop: 7, fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{ch.name} · {RARITY[ch.rarity].name}</Text>}

      <View style={{ marginTop: 16, alignSelf: "stretch", flexDirection: "row", borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card }}>
        <Stat value={card.record_count} label="기록" />
        <Stat value={card.verified_count} label="인증" brick border />
        <Stat value={card.post_count} label="게시글" border />
      </View>
      {/* TODO(칭호 목록): 칭호는 앱이 기록으로 계산해서 남의 「가진 칭호」는 서버가 모릅니다 — 대표 칭호 하나만 보여 줍니다. */}

      {button && (
        <Pressable
          onPress={button.onPress}
          disabled={busy}
          style={{ marginTop: 16, alignSelf: "stretch", height: 48, borderRadius: 16, backgroundColor: button.dark ? C.ink : C.card, borderWidth: button.dark ? 0 : 1, borderColor: C.line, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: button.dark ? C.card : card.friend_state === "sent" ? C.brick : C.ink }}>{button.label}</Text>
        </Pressable>
      )}

      {isAdmin && card.friend_state !== "self" && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>운영:</Text>
          <Pressable onPress={sanction} hitSlop={6}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: card.sanctioned_until ? C.brick : K.inactive }}>{card.sanctioned_until ? "정지 중" : "정지"}</Text>
          </Pressable>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>·</Text>
          <Pressable onPress={rankBan} hitSlop={6}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: card.rank_banned_until ? C.brick : K.inactive }}>{card.rank_banned_until ? "랭킹 정지 중" : "랭킹"}</Text>
          </Pressable>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>·</Text>
          <Pressable onPress={() => { onClose(); router.push({ pathname: "/community/board", params: { author: card.id } }); }} hitSlop={6}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>글 보기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const Stat = ({ value, label, brick, border }: { value: number; label: string; brick?: boolean; border?: boolean }) => (
  <View style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderLeftWidth: border ? 1 : 0, borderLeftColor: C.lineSoft }}>
    <Text style={{ fontFamily: F.serif, fontSize: 19, color: brick ? C.brick : C.ink }}>{value}</Text>
    <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{label}</Text>
  </View>
);

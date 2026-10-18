import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Row, Stat } from "@/components/AccountRows";
import { Character } from "@/components/Character";
import { Eyebrow, Toggle } from "@/components/ui";
import { useActiveBook } from "@/data/books";
import { useAccount, useOwnedCharacters, useSetCharacter, useSetLeaderboardOptIn, useTickets } from "@/data/profile";
import { refreshAll } from "@/data/invalidate";
import { usePersonalRows, usePersonalWishes } from "@/data/queries";
import { useIsAdmin } from "@/features/community/api";
import CoupleAccount from "@/features/couple/CoupleAccount";
import { apiFetch } from "@/lib/api";
import { CHARACTERS } from "@/lib/characters";
import { StampBoard } from "@/features/stamps/Stamp";
import { useSeenLabels } from "@/lib/labelSeen";
import { currentBoard, earnedLabels, nextBowl, stampRows, STAMPS_PER_BOARD } from "@/lib/labels";
import { uploadPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { SignedImage } from "@/lib/signedPhoto";

const PROVIDER_LABEL: Record<string, string> = { apple: "애플", google: "구글" };
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/**
 * 「연인」 탭 — 연인 기록장이면 연인계정(HANDOFF-couple-account §2). 개인 기록에선 탭바에 칸이 없어
 * 링크로 들어온 때만 여기 오고, 그때는 내계정을 보여줍니다(HANDOFF-recommend §1-2).
 */
export default function AccountTab() {
  const { isCouple } = useActiveBook();
  return isCouple ? <CoupleAccount /> : <MyAccount />;
}

/**
 * 내계정 — 프로필·통계·모은 라벨·계정 관리(HANDOFF-auth.md §3.3). 탭이 아니라 기록장 메뉴의 계정 사진으로
 * 밀려 들어오는 화면이라 왼쪽 위에 「‹」(HANDOFF-recommend §2). 연인 기록 중에도 내 계정은 이 화면입니다.
 */
export function MyAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const { data: rows = [], isSuccess: rowsReady } = usePersonalRows();
  const { data: wishes = [] } = usePersonalWishes();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const { data: owned = [] } = useOwnedCharacters();
  const { tickets } = useTickets();
  const setCharacter = useSetCharacter();
  const setLeaderboardOptIn = useSetLeaderboardOptIn();
  const { data: isAdmin } = useIsAdmin();
  const [error, setError] = useState("");

  const stamps = stampRows(rows).length;
  const board = currentBoard(stamps);
  const bowl = nextBowl(stamps);
  const earnedIds = earnedLabels(rows).filter((l) => l.earned).map((l) => l.id);
  const seen = useSeenLabels(account?.userId, earnedIds, rowsReady);

  if (!account) return <View style={{ flex: 1, backgroundColor: C.paper }} />;

  const records = rows.filter((r) => !r.pending).length;
  const verified = rows.filter((r) => r.verified).length;
  const places = new Set(rows.map(placeKeyOf)).size;
  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned);
  const titleLabelId = account.titleLabelId;
  const titleLabel = titleLabelId ? got.find((l) => l.id === titleLabelId) ?? null : null;
  const connectedLine = account.providers.length ? account.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" · ") + " 연결됨" : "연결된 계정 없음";

  // 대표가 맨 앞, 나머지는 도감 순서.
  const ownedSorted = [...owned].sort((a, b) =>
    a.id === account.characterId ? -1 : b.id === account.characterId ? 1 : CHARACTERS.findIndex((c) => c.id === a.id) - CHARACTERS.findIndex((c) => c.id === b.id));

  async function pickCharacter(id: (typeof owned)[number]["id"]) {
    if (id === account!.characterId) return;
    setError("");
    try {
      await setCharacter(account!.userId, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "대표 캐릭터를 바꾸지 못했습니다");
    }
  }

  async function saveAvatar(url: string | null) {
    setAvatarBusy(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인이 필요합니다"); setAvatarBusy(false); return; }
    const { error: err } = await supabase.from("profiles").upsert({ id: user.id, avatar_url: url });
    setAvatarBusy(false);
    if (err) return setError(err.message);
    refreshAll(qc);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    setAvatarBusy(true);
    setError("");
    try {
      await saveAvatar(await uploadPhoto(res.assets[0].uri, "avatar.jpg"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했습니다");
      setAvatarBusy(false);
    }
  }

  async function selectTitleLabel(id: string) {
    if (labelBusy) return;
    setLabelBusy(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인이 필요합니다"); setLabelBusy(false); return; }
    const { error: err } = await supabase.from("profiles").upsert({ id: user.id, title_label_id: titleLabelId === id ? null : id });
    setLabelBusy(false);
    if (err) return setError(err.message);
    refreshAll(qc);
  }

  function exportRecords() {
    const payload = { exported_at: new Date().toISOString(), restaurants: rows, wishes };
    Share.share({ title: `dinary-${new Date().toISOString().slice(0, 10)}.json`, message: JSON.stringify(payload, null, 2) });
  }

  function withdraw() {
    Alert.alert("회원 탈퇴", "탈퇴하면 계정과 모든 기록·사진이 되돌릴 수 없게 삭제됩니다. 계속할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "탈퇴", style: "destructive",
        onPress: async () => {
          const res = await apiFetch("/api/account/delete", { method: "POST" });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            return setError(body?.error ?? "탈퇴하지 못했습니다");
          }
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 74 + insets.bottom + 32 }}>
      <View style={{ marginLeft: -12, marginTop: -10, flexDirection: "row", alignItems: "center" }}>
        {/* 기록장 메뉴가 있는 지도로 돌아갑니다. */}
        <Pressable onPress={() => router.navigate("/")} accessibilityLabel="뒤로" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 24, lineHeight: 28, color: C.ink }}>‹</Text>
        </Pressable>
        <Eyebrow wide>PROFILE</Eyebrow>
      </View>

      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable onPress={pickPhoto} disabled={avatarBusy} accessibilityLabel="프로필 사진 바꾸기" style={{ opacity: avatarBusy ? 0.7 : 1 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: C.line, backgroundColor: "#ded8cb", overflow: "hidden" }}>
            {account.avatarUrl && <SignedImage uri={account.avatarUrl} style={{ width: 64, height: 64 }} />}
          </View>
          <View style={{ position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.paper, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 10, color: C.card }}>✎</Text>
          </View>
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 21, color: C.ink }}>{account.nickname || "이름 없음"}</Text>
            <Character id={account.characterId} size={26} />
            {titleLabel && (
              <Text style={{ borderRadius: 12, borderWidth: 1, borderColor: `${titleLabel.color}4d`, backgroundColor: `${titleLabel.color}1a`, paddingHorizontal: 8, paddingVertical: 3, fontFamily: F.sansBd, fontSize: 10.5, color: titleLabel.color, overflow: "hidden" }}>{titleLabel.name}</Text>
            )}
          </View>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 11, backgroundColor: C.brickSoft, paddingHorizontal: 8, paddingVertical: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink }} />
              <Text style={{ fontFamily: F.sans, fontSize: 10.5, color: C.muted }}>{connectedLine}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>SINCE {account.since.slice(0, 4)}.{account.since.slice(5, 7)}</Text>
          </View>
          <View style={{ marginTop: 6, flexDirection: "row", gap: 10 }}>
            <Pressable onPress={pickPhoto} disabled={avatarBusy}><Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>{avatarBusy ? "처리하는 중…" : "사진 바꾸기"}</Text></Pressable>
            {account.avatarUrl && <Pressable onPress={() => saveAvatar(null)} disabled={avatarBusy}><Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>기본 이미지로</Text></Pressable>}
          </View>
        </View>
      </View>

      <View style={{ marginTop: 18, flexDirection: "row", borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card }}>
        <Stat value={records} label="기록" />
        <Stat value={verified} label="인증" brick border />
        <Stat value={places} label="식당" border />
      </View>

      {/* 도장판 — 인증 1건 = 도장 1개, 10칸을 채울 때마다 뽑기권 1장 */}
      <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>도장판</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{board.board}장째 · {board.filled} / {STAMPS_PER_BOARD}</Text>
        </View>
        <View style={{ marginTop: 14, alignItems: "center" }}>
          <StampBoard filled={board.filled} firstNo={(board.board - 1) * STAMPS_PER_BOARD + 1} size={42} gap={11} numberEmpty />
        </View>
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>채운 판 {board.done}장 · 뽑기권 {tickets}</Text>
          <Pressable onPress={() => router.push("/draw")} disabled={tickets < 1} style={{ minHeight: 36, borderRadius: 13, backgroundColor: C.ink, paddingHorizontal: 13, justifyContent: "center", opacity: tickets < 1 ? 0.4 : 1 }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>밥솥 열러 가기</Text>
          </Pressable>
        </View>
      </View>

      {bowl && (
        <View style={{ marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{bowl.tier.name}까지 <Text style={{ color: C.brick }}>{bowl.left}</Text></Text>
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{bowl.from}</Text>
            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: "#ece7dc", overflow: "hidden" }}>
              <View style={{ width: `${((stamps - bowl.from) / (bowl.tier.need - bowl.from)) * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.brick }} />
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{bowl.tier.need}</Text>
          </View>
        </View>
      )}

      <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>내 캐릭터</Text>
        <Pressable onPress={() => router.push("/characters")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{owned.length} / {CHARACTERS.length} ›</Text></Pressable>
      </View>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>탭하면 닉네임 옆과 랭킹에 이 캐릭터가 나옵니다</Text>
      <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
        {ownedSorted.slice(0, 3).map((o) => {
          const on = o.id === account.characterId;
          return (
            <Pressable
              key={o.id}
              onPress={() => pickCharacter(o.id)}
              accessibilityLabel={`${CHARACTERS.find((c) => c.id === o.id)?.name} 대표로`}
              style={{ width: 62, height: 62, borderRadius: 16, borderWidth: on ? 1.5 : 1, borderColor: on ? C.brick : "#e2ddd2", backgroundColor: on ? C.brickSoft : C.card, alignItems: "center", justifyContent: "center" }}
            >
              <Character id={o.id} size={48} />
            </Pressable>
          );
        })}
        {owned.length > 3 && (
          <Pressable onPress={() => router.push("/characters")} style={{ width: 62, height: 62, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.faint }}>+{owned.length - 3}</Text>
          </Pressable>
        )}
      </View>
      {got.length > 0 && (
        <>
          <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>모은 라벨</Text>
            <Pressable onPress={() => router.push("/labels")}><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{got.length} / {labels.length} ›</Text></Pressable>
          </View>
          <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>탭하면 닉네임 옆 대표 라벨로 붙습니다</Text>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {[...got].sort((a, b) => Number(b.id === titleLabelId) - Number(a.id === titleLabelId) || Number(seen.isNew(b.id)) - Number(seen.isNew(a.id))).slice(0, 3).map((l) => {
              const on = l.id === titleLabelId;
              const fresh = seen.isNew(l.id);
              return (
                <Pressable key={l.id} onPress={() => selectTitleLabel(l.id)} disabled={labelBusy} style={{ borderRadius: 13, borderWidth: 1, borderColor: on || fresh ? C.brick : "rgba(180,85,45,.2)", backgroundColor: on ? C.brick : C.brickSoft, paddingHorizontal: 11, paddingVertical: 5, opacity: labelBusy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: on ? "#fdf9f3" : C.brick }}>{on ? "✓ " : ""}{l.name}{fresh ? " · 새로" : ""}</Text>
                </Pressable>
              );
            })}
            {got.length > 3 && (
              <Pressable onPress={() => router.push("/labels")} style={{ borderRadius: 13, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.lineSoft, paddingHorizontal: 11, paddingVertical: 5 }}>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>+{got.length - 3}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={{ marginTop: 22, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
        <Row label="계정 연결" border={false} right={<Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{connectedLine}</Text>} />
        {/* 커뮤니티 랭킹 참여 — 끄면 다음 집계부터 빠지고 지난 순위는 남지 않습니다 */}
        <Row
          label="랭킹 참여"
          right={<Toggle label="랭킹 참여" value={account.leaderboardOptIn} onChange={(v) => setLeaderboardOptIn(account.userId, v).catch((e) => setError(e instanceof Error ? e.message : "바꾸지 못했습니다"))} />}
        />
        <Row label="라벨첩" onPress={() => router.push("/labels")} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
        {isAdmin && <Row label="운영" onPress={() => router.push("/admin")} right={<Text style={{ fontFamily: F.mono, fontSize: 11, color: C.brick }}>공지 · 신고함 · 주제 ›</Text>} />}
        <Row label="기록 내려받기" onPress={exportRecords} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
        <Row label="개인정보 처리방침" onPress={() => WebBrowser.openBrowserAsync(`${BASE}/privacy`)} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
        <Row label="이용약관" onPress={() => WebBrowser.openBrowserAsync(`${BASE}/terms`)} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
        <Row label="로그아웃" onPress={() => supabase.auth.signOut()} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
        <Row label="회원 탈퇴" onPress={withdraw} danger right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
      </View>

      {!!error && <Text style={{ marginTop: 12, textAlign: "center", fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}
    </ScrollView>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Character } from "@/components/Character";
import { Eyebrow } from "@/components/ui";
import { useAccount, useOwnedCharacters, useSetCharacter, useTickets } from "@/data/profile";
import { refreshAll } from "@/data/invalidate";
import { usePersonalRows, usePersonalWishes } from "@/data/queries";
import { apiFetch } from "@/lib/api";
import { CHARACTERS } from "@/lib/characters";
import { earnedLabels } from "@/lib/labels";
import { uploadPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", google: "구글" };
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

function Stat({ value, label, brick, border }: { value: number; label: string; brick?: boolean; border?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderLeftWidth: border ? 1 : 0, borderLeftColor: C.lineSoft }}>
      <Text style={{ fontFamily: F.mono, fontSize: 22, color: brick ? C.brick : C.ink }}>{value}</Text>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{label}</Text>
    </View>
  );
}

function Row({ label, right, onPress, danger, border = true }: { label: string; right: React.ReactNode; onPress?: () => void; danger?: boolean; border?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderTopWidth: border ? 1 : 0, borderTopColor: C.lineSoft }}>
      <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: danger ? C.faint : C.ink }}>{label}</Text>
      {right}
    </Pressable>
  );
}

/** 내계정 탭 — 프로필·통계·모은 라벨·계정 관리(HANDOFF-auth.md §3.3). */
export default function AccountTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const { data: rows = [] } = usePersonalRows();
  const { data: wishes = [] } = usePersonalWishes();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const { data: owned = [] } = useOwnedCharacters();
  const { tickets, untilNext } = useTickets();
  const setCharacter = useSetCharacter();
  const [error, setError] = useState("");

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
      <Eyebrow wide>PROFILE</Eyebrow>

      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable onPress={pickPhoto} disabled={avatarBusy} accessibilityLabel="프로필 사진 바꾸기" style={{ opacity: avatarBusy ? 0.7 : 1 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: C.line, backgroundColor: "#ded8cb", overflow: "hidden" }}>
            {account.avatarUrl && <Image source={{ uri: account.avatarUrl }} style={{ width: 64, height: 64 }} />}
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
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 18, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingVertical: 12, paddingHorizontal: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>뽑기권 {tickets}장</Text>
          <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: 10, color: C.faint }}>다음 장까지 인증 기록 {untilNext}건</Text>
        </View>
        <Pressable onPress={() => router.push("/draw")} disabled={tickets < 1} style={{ minHeight: 40, borderRadius: 14, backgroundColor: C.ink, paddingHorizontal: 14, justifyContent: "center", opacity: tickets < 1 ? 0.4 : 1 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>밥솥 열러 가기</Text>
        </Pressable>
      </View>

      {got.length > 0 && (
        <>
          <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>모은 라벨</Text>
            <Pressable onPress={() => router.push("/labels")}><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{got.length} / {labels.length} ›</Text></Pressable>
          </View>
          <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>탭하면 닉네임 옆 대표 라벨로 붙습니다</Text>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {[...got].sort((a, b) => Number(b.id === titleLabelId) - Number(a.id === titleLabelId)).slice(0, 3).map((l) => {
              const on = l.id === titleLabelId;
              return (
                <Pressable key={l.id} onPress={() => selectTitleLabel(l.id)} disabled={labelBusy} style={{ borderRadius: 13, borderWidth: 1, borderColor: on ? C.brick : "rgba(180,85,45,.2)", backgroundColor: on ? C.brick : C.brickSoft, paddingHorizontal: 11, paddingVertical: 5, opacity: labelBusy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: on ? "#fdf9f3" : C.brick }}>{on ? "✓ " : ""}{l.name}</Text>
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
        <Row label="라벨첩" onPress={() => router.push("/labels")} right={<Text style={{ fontSize: 13, color: C.faint }}>›</Text>} />
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

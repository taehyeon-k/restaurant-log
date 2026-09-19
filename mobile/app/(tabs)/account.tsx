/**
 * 내계정 — 웹 `AccountScreen.tsx` 그대로입니다.
 * 회원 탈퇴만 다릅니다: 웹의 `/api/account/delete` 대신 supabase 엣지 함수
 * `delete-account` 를 부릅니다(서비스 롤 키를 앱에 담을 수 없기 때문입니다).
 */
import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";

import { Eyebrow, PhotoFill } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { uploadPhotoFromUri } from "@/lib/photos";
import { earnedLabels } from "@/lib/labels";
import { useAccount, useRefresh, useRestaurants, useWishes } from "@/lib/data";
import type { Restaurant, Wish } from "@/lib/types";
import { C, FONT, TAB_BAR_HEIGHT } from "@/lib/theme";

const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", google: "구글" };

const since = (iso: string) => `SINCE ${iso.slice(0, 4)}.${iso.slice(5, 7)}`;

const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** 기록 내려받기 — 파일로 써서 공유 시트로 넘깁니다(웹의 `<a download>` 자리). */
async function exportRecords(rows: Restaurant[], wishes: Wish[]) {
  const payload = { exported_at: new Date().toISOString(), restaurants: rows, wishes };
  const path = `${FileSystem.cacheDirectory}dinary-${new Date().toISOString().slice(0, 10)}.json`;

  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: "application/json", UTI: "public.json" });
  }
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();

  const { data: account } = useAccount();
  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState("");
  const avatarLocal = useRef<string | null>(null);

  if (!account) return <View style={{ flex: 1, backgroundColor: C.paper }} />;

  const avatarUrl = avatarLocal.current ?? account.avatarUrl;
  const records = rows.filter((r) => !r.pending).length;
  const verified = rows.filter((r) => r.verified).length;
  const places = new Set(rows.map(placeKeyOf)).size;

  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned);
  // 대표 라벨은 서버에서 온 값을 그대로 씁니다 — 라벨첩에서 바꿔도 이 화면이 따라옵니다.
  const titleLabelId = account.titleLabelId;
  const titleLabel = titleLabelId ? got.find((l) => l.id === titleLabelId) ?? null : null;

  const connectedLine = account.providers.length
    ? account.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" · ") + " 연결됨"
    : "연결된 계정 없음";

  async function saveAvatar(url: string | null) {
    setAvatarBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const { error: err } = await supabase.from("profiles").upsert({ id: user.id, avatar_url: url });
      if (err) throw new Error(err.message);

      avatarLocal.current = url;
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 바꾸지 못했습니다");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;

    setAvatarBusy(true);
    setError("");
    try {
      await saveAvatar(await uploadPhotoFromUri(result.assets[0].uri, "avatar.jpg"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다");
      setAvatarBusy(false);
    }
  }

  async function selectTitleLabel(id: string) {
    if (labelBusy) return;
    const next = titleLabelId === id ? null : id;
    setLabelBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const { error: err } = await supabase.from("profiles").upsert({ id: user.id, title_label_id: next });
      if (err) throw new Error(err.message);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "대표 라벨을 바꾸지 못했습니다");
    } finally {
      setLabelBusy(false);
    }
  }

  async function logout() {
    setBusy("logout");
    await supabase.auth.signOut();
    setBusy(null);
    router.replace("/login");
  }

  function withdraw() {
    Alert.alert(
      "회원 탈퇴",
      "탈퇴하면 계정과 모든 기록·사진이 되돌릴 수 없게 삭제됩니다. 계속할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "탈퇴",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            setError("");
            try {
              const { error: err } = await supabase.functions.invoke("delete-account", { method: "POST" });
              if (err) throw new Error(err.message);
              await supabase.auth.signOut();
              router.replace("/login");
            } catch (err) {
              setError(err instanceof Error ? err.message : "탈퇴하지 못했습니다");
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.paper }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 20,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 32,
      }}
    >
      <Eyebrow wide>PROFILE</Eyebrow>

      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable onPress={pickAvatar} disabled={avatarBusy} accessibilityLabel="프로필 사진 바꾸기">
          <PhotoFill
            src={avatarUrl}
            category={null}
            radius={32}
            style={{ width: 64, height: 64, borderWidth: 1, borderColor: C.line, opacity: avatarBusy ? 0.7 : 1 }}
          />
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: C.paper,
              backgroundColor: C.ink,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 10, color: C.card }}>✎</Text>
          </View>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: FONT.serifBold, fontSize: 21, color: C.ink }}>
              {account.nickname || "이름 없음"}
            </Text>
            {titleLabel && (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${titleLabel.color}4d`,
                  backgroundColor: `${titleLabel.color}1a`,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 10.5, color: titleLabel.color, fontFamily: FONT.sansBold }}>
                  {titleLabel.name}
                </Text>
              </View>
            )}
          </View>

          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 11,
                backgroundColor: C.brickSoft,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink }} />
              <Text style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT.sans }}>{connectedLine}</Text>
            </View>
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint }}>{since(account.since)}</Text>
          </View>

          <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={pickAvatar} disabled={avatarBusy} hitSlop={6}>
              <Text style={{ fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>
                {avatarBusy ? "처리하는 중…" : "사진 바꾸기"}
              </Text>
            </Pressable>
            {avatarUrl && (
              <Pressable onPress={() => saveAvatar(null)} disabled={avatarBusy} hitSlop={6}>
                <Text style={{ fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>기본 이미지로</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View
        style={{
          marginTop: 18,
          flexDirection: "row",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: C.lineSoft,
          backgroundColor: C.card,
        }}
      >
        <Stat value={records} label="기록" />
        <Divider />
        <Stat value={verified} label="인증" brick />
        <Divider />
        <Stat value={places} label="식당" />
      </View>

      {got.length > 0 && (
        <>
          <View style={{ marginTop: 20, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: FONT.serifBold, fontSize: 15, color: C.ink }}>모은 라벨</Text>
            <Pressable onPress={() => router.push("/labels")} hitSlop={6}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.faint }}>
                {got.length} / {labels.length} ›
              </Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 4, fontSize: 10.5, color: C.faint, fontFamily: FONT.sans }}>
            탭하면 닉네임 옆 대표 라벨로 붙습니다
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {[...got]
              .sort((a, b) => Number(b.id === titleLabelId) - Number(a.id === titleLabelId))
              .slice(0, 3)
              .map((l) => {
                const on = l.id === titleLabelId;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => selectTitleLabel(l.id)}
                    disabled={labelBusy}
                    accessibilityState={{ selected: on }}
                    style={{
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: on ? C.brick : "rgba(180,85,45,.2)",
                      backgroundColor: on ? C.brick : C.brickSoft,
                      paddingHorizontal: 11,
                      paddingVertical: 5,
                      opacity: labelBusy ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, color: on ? "#fdf9f3" : C.brick, fontFamily: FONT.sans }}>
                      {on ? "✓ " : ""}
                      {l.name}
                    </Text>
                  </Pressable>
                );
              })}
            {got.length > 3 && (
              <Pressable
                onPress={() => router.push("/labels")}
                style={{
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: C.lineSoft,
                  backgroundColor: C.lineSoft,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>+{got.length - 3}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View
        style={{
          marginTop: 22,
          overflow: "hidden",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: C.lineSoft,
          backgroundColor: C.card,
        }}
      >
        <Row label="계정 연결" right={<Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>{connectedLine}</Text>} border={false} />
        <Row label="기록 내려받기" onPress={() => void exportRecords(rows, wishes)} />
        <Row label="보관함" onPress={() => router.push("/drafts")} />
        <Row label="로그아웃" onPress={logout} />
        <Row label="회원 탈퇴" onPress={withdraw} danger />
      </View>

      {busy && (
        <Text style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
          처리하는 중…
        </Text>
      )}
      {error.length > 0 && (
        <Text style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, color: C.brick, fontFamily: FONT.sans }}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

function Stat({ value, label, brick }: { value: number; label: string; brick?: boolean }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 22, color: brick ? C.brick : C.ink }}>{value}</Text>
      <Text style={{ marginTop: 4, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>{label}</Text>
    </View>
  );
}

const Divider = () => <View style={{ width: 1, backgroundColor: C.lineSoft }} />;

function Row({
  label,
  right,
  onPress,
  danger,
  border = true,
}: {
  label: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  border?: boolean;
}) {
  const body = (
    <View
      style={{
        minHeight: 50,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        borderTopWidth: border ? 1 : 0,
        borderTopColor: C.lineSoft,
      }}
    >
      <Text style={{ fontSize: 13.5, color: danger ? C.faint : C.ink, fontFamily: FONT.sans }}>{label}</Text>
      {right ?? <Text style={{ fontSize: 13, color: C.faint }}>›</Text>}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

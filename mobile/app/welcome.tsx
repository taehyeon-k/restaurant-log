/**
 * 첫 로그인에만 — 닉네임과 프로필 사진을 정합니다. 웹 `WelcomeScreen.tsx` 그대로입니다.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { Eyebrow, PhotoFill } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { uploadPhotoFromUri } from "@/lib/photos";
import { useAccount, useRefresh } from "@/lib/data";
import { C, FONT } from "@/lib/theme";

const MAX_LEN = 12;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const refresh = useRefresh();
  const { data: account } = useAccount();

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    setError("");
    try {
      setAvatarUrl(await uploadPhotoFromUri(result.assets[0].uri, "avatar.jpg"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = nickname.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다");
      setSaving(false);
      return;
    }

    // update 가 아니라 upsert — 가입 트리거가 생기기 전에 이미 로그인했던 계정은
    // profiles 행이 아예 없어서, update 는 0행에 조용히 "성공"하고 아무것도 안 남습니다.
    const { error: err } = await supabase
      .from("profiles")
      .upsert({ id: user.id, nickname: trimmed, avatar_url: avatarUrl });

    if (err) {
      setError(
        err.code === "23505"
          ? "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 정해주세요."
          : err.message
      );
      setSaving(false);
      return;
    }

    // 닉네임이 들어오면 루트 레이아웃의 문지기가 기록 화면으로 보냅니다.
    refresh();
  }

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: C.paper,
        paddingHorizontal: 30,
        paddingTop: insets.top + 54,
        paddingBottom: insets.bottom + 20,
      }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Eyebrow wide>STEP 1 / 1</Eyebrow>
      <Text style={{ marginTop: 12, fontFamily: FONT.serifBold, fontSize: 24, color: C.ink }}>어떻게 부를까요?</Text>
      <Text style={{ marginTop: 10, fontSize: 12.5, lineHeight: 22, color: C.faint, fontFamily: FONT.sans }}>
        기록장 맨 위에 쓰입니다. 나중에 바꿀 수 있습니다.
      </Text>

      <View style={{ marginTop: 34, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <PhotoFill
          src={avatarUrl}
          category={null}
          radius={39}
          style={{ width: 78, height: 78, borderWidth: 1, borderColor: C.line }}
        >
          {!avatarUrl && (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.faint }}>
                {uploading ? "…" : "PHOTO"}
              </Text>
            </View>
          )}
        </PhotoFill>

        <Pressable
          onPress={pickPhoto}
          disabled={uploading}
          style={{
            minHeight: 38,
            justifyContent: "center",
            borderRadius: 19,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.card,
            paddingHorizontal: 14,
            opacity: uploading ? 0.7 : 1,
          }}
        >
          <Text style={{ fontSize: 12.5, color: C.ink, fontFamily: FONT.sans }}>
            {uploading ? "올리는 중…" : "사진 고르기"}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 34 }}>
        <Eyebrow>NICKNAME</Eyebrow>
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderBottomWidth: 1.5,
            borderBottomColor: C.brick,
            paddingBottom: 10,
          }}
        >
          <TextInput
            value={nickname}
            onChangeText={(v) => setNickname(v.slice(0, MAX_LEN))}
            placeholder="닉네임"
            placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: FONT.serifBold, fontSize: 21, color: C.ink, padding: 0 }}
          />
          <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.faint }}>
            {nickname.length}/{MAX_LEN}
          </Text>
        </View>
        {error.length > 0 && (
          <Text style={{ marginTop: 10, fontSize: 11.5, color: C.brick, fontFamily: FONT.sans }}>{error}</Text>
        )}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={submit}
        disabled={!nickname.trim() || saving}
        style={{
          minHeight: 54,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          backgroundColor: C.brick,
          paddingHorizontal: 20,
          opacity: !nickname.trim() || saving ? 0.6 : 1,
        }}
      >
        <Text style={{ fontSize: 15, color: C.card, fontFamily: FONT.sansMedium }}>
          {saving ? "저장하는 중…" : "기록 시작하기"}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

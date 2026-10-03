import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { refreshAll } from "@/data/invalidate";
import { uploadPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { C, F, SHADOW } from "@/theme";

const MAX_LEN = 12;

/** 첫 로그인에만 — 닉네임과 프로필 사진을 정합니다(웹 WelcomeScreen 의 폰 레이아웃). */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fromOAuth, setFromOAuth] = useState(false);
  const [provider, setProvider] = useState("카카오");
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // OAuth 가 준 이름·사진을 미리 채웁니다.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name = (meta.name as string) || (meta.full_name as string) || "";
      setNickname(name.slice(0, MAX_LEN));
      setFromOAuth(Boolean(name));
      setAvatarUrl((meta.avatar_url as string) || (meta.picture as string) || null);
      setProvider(user.app_metadata?.provider === "google" ? "구글" : "카카오");
    });
  }, []);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    setUploading(true);
    setError("");
    try {
      setAvatarUrl(await uploadPhoto(res.assets[0].uri, "avatar.jpg"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했습니다");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = nickname.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인이 필요합니다"); setSaving(false); return; }
    // update 가 아니라 upsert — profiles 행이 없는 계정은 update 가 0행에 조용히 "성공"합니다.
    const { error: err } = await supabase.from("profiles").upsert({ id: user.id, nickname: trimmed, avatar_url: avatarUrl });
    if (err) {
      setError(err.code === "23505" ? "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 정해주세요." : err.message);
      setSaving(false);
      return;
    }
    await refreshAll(qc);
    router.replace("/");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper, paddingHorizontal: 30, paddingTop: insets.top + 54, paddingBottom: insets.bottom + 20 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.8, color: C.faint }}>STEP 1 / 1</Text>
      <Text style={{ marginTop: 12, fontFamily: F.serif, fontSize: 24, color: C.ink }}>어떻게 부를까요?</Text>
      <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12.5, lineHeight: 22, color: C.faint }}>기록장 맨 위에 쓰입니다. 나중에 바꿀 수 있습니다.</Text>

      <View style={{ marginTop: 34, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 1, borderColor: C.line, backgroundColor: "#ded8cb", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 78, height: 78 }} /> : <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.5, color: C.faint }}>{uploading ? "…" : "PHOTO"}</Text>}
        </View>
        <Pressable onPress={pickPhoto} disabled={uploading} style={{ minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14, justifyContent: "center", opacity: uploading ? 0.7 : 1 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.ink }}>{uploading ? "올리는 중…" : "사진 고르기"}</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 34 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.6, color: C.faint }}>NICKNAME</Text>
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1.5, borderBottomColor: C.brick, paddingBottom: 10 }}>
          <TextInput
            value={nickname}
            onChangeText={(t) => { setTouched(true); setNickname(t.slice(0, MAX_LEN)); }}
            placeholder="닉네임" placeholderTextColor={C.faint}
            style={{ flex: 1, padding: 0, fontFamily: F.serif, fontSize: 21, color: C.ink }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{nickname.length}/{MAX_LEN}</Text>
        </View>
        {fromOAuth && !touched && <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{provider} 계정 이름을 가져왔습니다.</Text>}
        {!!error && <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={submit} disabled={!nickname.trim() || saving}
        style={[{ minHeight: 54, borderRadius: 16, backgroundColor: C.brick, alignItems: "center", justifyContent: "center", opacity: !nickname.trim() || saving ? 0.6 : 1 }, SHADOW.card]}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 15, color: C.card }}>{saving ? "저장하는 중…" : "기록 시작하기"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

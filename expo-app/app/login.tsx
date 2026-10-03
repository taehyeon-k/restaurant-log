import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { C, F } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

/** 카카오 로그인 — 웹의 auth/callback 라우트 대신 dinary://auth 딥링크로 돌아옵니다(핸드오프 §5). */
export default function Login() {
  const insets = useSafeAreaInsets();
  const [err, setErr] = useState("");

  async function kakao() {
    setErr("");
    const redirectTo = Linking.createURL("auth");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return setErr(error?.message ?? "로그인을 시작하지 못했습니다");

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== "success") return;

    const params = new URLSearchParams(res.url.split("#")[1] ?? res.url.split("?")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return setErr("로그인 정보를 받지 못했습니다");

    const { error: e2 } = await supabase.auth.setSession({ access_token, refresh_token });
    if (e2) setErr(e2.message);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + 24 }]}>
      <Text style={s.logo}>DINARY</Text>
      <Text style={s.sub}>가본 곳을 남기는 식당 기록</Text>
      <View style={{ flex: 1 }} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={s.kakao} onPress={kakao}>
        <Text style={s.kakaoText}>카카오로 시작하기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 24 },
  logo: { fontFamily: F.serif, fontSize: 34, color: C.ink, letterSpacing: 2 },
  sub: { marginTop: 10, fontFamily: F.sans, fontSize: 13, color: C.muted },
  err: { fontFamily: F.sans, fontSize: 12, color: C.brick, marginBottom: 10, textAlign: "center" },
  kakao: { height: 52, borderRadius: 20, backgroundColor: C.kakao, alignItems: "center", justifyContent: "center" },
  kakaoText: { fontFamily: F.sansMd, fontSize: 15, color: "#191600" },
});

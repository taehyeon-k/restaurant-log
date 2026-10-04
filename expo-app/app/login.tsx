import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { C, F, SHADOW } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

type Provider = "kakao" | "google";

/** 말풍선 마크 — 카카오 로그인 버튼 전용(카카오 브랜드 가이드가 정한 모양). */
function KakaoIcon() {
  return (
    <View style={{ width: 22, height: 20 }}>
      <View style={{ width: 22, height: 17, borderRadius: 11, backgroundColor: C.ink }} />
      <View style={{ position: "absolute", left: 5, bottom: 0, width: 0, height: 0, borderLeftWidth: 2, borderRightWidth: 4, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: C.ink }} />
    </View>
  );
}

/** 구글 공식 4색 G 마크 — "Google로 시작하기" 버튼 전용(웹 LoginScreen 과 같은 path). */
function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <Path fill="#FBBC05" d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 000 9c0 1.4523.3477 2.8264.9573 4.0418L3.9641 10.71z" />
      <Path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </Svg>
  );
}

/** 돌아온 dinary://auth?…#… 의 쿼리와 해시를 한데 모읍니다 — 토큰은 해시로, 에러는 둘 중 어디로든 옵니다. */
function readParams(url: string) {
  const params = new URLSearchParams(url.split("?")[1]?.split("#")[0] ?? "");
  new URLSearchParams(url.split("#")[1] ?? "").forEach((v, k) => params.set(k, v));
  return params;
}

/** 카카오·구글 로그인 — 웹의 auth/callback 라우트 대신 dinary://auth 딥링크로 돌아옵니다(핸드오프 §5). */
export default function Login() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [err, setErr] = useState("");

  async function login(provider: Provider) {
    setBusy(provider);
    setErr("");
    try {
      const redirectTo = Linking.createURL("auth");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) return setErr(error?.message ?? "로그인을 시작하지 못했습니다");

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== "success") return;

      const params = readParams(res.url);
      const failure = params.get("error_description") ?? params.get("error");
      if (failure) return setErr(failure.replace(/\+/g, " "));

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return setErr("로그인 정보를 받지 못했습니다");

      const { error: e2 } = await supabase.auth.setSession({ access_token, refresh_token });
      if (e2) setErr(e2.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로그인하지 못했습니다");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + 24 }]}>
      <Text style={s.logo}>DINARY</Text>
      <Text style={s.sub}>가본 곳을 남기는 식당 기록</Text>
      <View style={{ flex: 1 }} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <View style={{ gap: 11 }}>
        <Pressable style={[s.btn, s.kakao, SHADOW.card, busy && s.dim]} disabled={busy !== null} onPress={() => login("kakao")}>
          <KakaoIcon />
          <Text style={[s.btnText, { color: "#191600" }]}>{busy === "kakao" ? "연결하는 중…" : "카카오로 시작하기"}</Text>
        </Pressable>
        <Pressable style={[s.btn, s.google, busy && s.dim]} disabled={busy !== null} onPress={() => login("google")}>
          <GoogleIcon />
          <Text style={s.btnText}>{busy === "google" ? "연결하는 중…" : "Google로 시작하기"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 24 },
  logo: { fontFamily: F.serif, fontSize: 34, color: C.ink, letterSpacing: 2 },
  sub: { marginTop: 10, fontFamily: F.sans, fontSize: 13, color: C.muted },
  err: { fontFamily: F.sans, fontSize: 12, color: C.brick, marginBottom: 10, textAlign: "center" },
  btn: { height: 52, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  btnText: { flex: 1, fontFamily: F.sansMd, fontSize: 15, color: C.ink },
  kakao: { backgroundColor: C.kakao },
  google: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  dim: { opacity: 0.7 },
});

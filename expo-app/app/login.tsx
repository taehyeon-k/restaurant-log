import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthButton } from "@/components/AuthButton";
import { finishOAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { C, F } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

type Provider = "apple" | "google";

/** 애플·구글 로그인 — 웹의 auth/callback 라우트 대신 dinary://auth 딥링크로 돌아옵니다(핸드오프 §5). */
export default function Login() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<Provider | null>(null);
  // /auth 라우트가 실패하면 ?error= 로 돌려보냅니다.
  const { error: routeError } = useLocalSearchParams<{ error?: string }>();
  const [err, setErr] = useState(routeError ?? "");
  const [appleOk, setAppleOk] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleOk, () => setAppleOk(false));
  }, []);

  async function loginApple() {
    setBusy("apple");
    setErr("");
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) return setErr("로그인 정보를 받지 못했습니다");
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken });
      if (error) return setErr(error.message);
      // 이름은 애플이 첫 로그인 때 한 번만 줍니다 — 받은 즉시 계정에 보관.
      const n = credential.fullName;
      const full_name = [n?.familyName, n?.givenName].filter(Boolean).join(" ");
      if (full_name) await supabase.auth.updateUser({ data: { full_name } });
    } catch (e) {
      if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
      setErr(e instanceof Error ? e.message : "로그인하지 못했습니다");
    } finally {
      setBusy(null);
    }
  }

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

      const failure = await finishOAuth(res.url);
      if (failure) setErr(failure);
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
        {appleOk && <AuthButton variant="apple" busy={busy === "apple"} disabled={busy !== null} onPress={loginApple} />}
        <AuthButton variant="google" busy={busy === "google"} disabled={busy !== null} onPress={() => login("google")} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 24 },
  logo: { fontFamily: F.serif, fontSize: 34, color: C.ink, letterSpacing: 2 },
  sub: { marginTop: 10, fontFamily: F.sans, fontSize: 13, color: C.muted },
  err: { fontFamily: F.sans, fontSize: 12, color: C.brick, marginBottom: 10, textAlign: "center" },
});

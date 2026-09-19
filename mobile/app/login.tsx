/**
 * 로그인 — 로그인 없이는 어떤 화면도 열리지 않으므로 둘러보기 없이 버튼뿐입니다.
 * 웹의 `/auth/callback` 라우트는 앱에서 못 쓰므로 `dinary://auth` 스킴으로
 * 받아 코드를 여기서 세션으로 바꿉니다(§5). Supabase 콘솔의 Redirect URLs 에
 * 이 스킴을 반드시 추가해 두세요.
 */
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import Svg, { Path } from "react-native-svg";

import { supabase } from "@/lib/supabase";
import { C, FONT } from "@/lib/theme";

type Provider = "kakao" | "google";

// 카카오 로그인에 문제가 생겨 한동안 막아둡니다 — 고치면 이 줄만 true 로 되돌리면 됩니다.
const KAKAO_ENABLED = false;

const REDIRECT = ExpoLinking.createURL("auth");

/** 구글 공식 4색 G 마크 — "Google로 시작하기" 버튼 전용. */
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

/** 말풍선 마크 — 카카오 로그인 버튼 전용(카카오 브랜드 가이드가 정한 모양). */
function KakaoIcon() {
  return (
    <Svg width={22} height={20} viewBox="0 0 22 20">
      <Path
        fill={C.ink}
        d="M11 0C4.92 0 0 3.86 0 8.62c0 3.05 2.03 5.72 5.08 7.23l-1.2 4.02a.3.3 0 0 0 .45.34l4.8-3.18c.61.08 1.24.13 1.87.13 6.08 0 11-3.86 11-8.62S17.08 0 11 0Z"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  async function login(provider: Provider) {
    setBusy(provider);
    setError("");

    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: REDIRECT,
          // 브라우저를 우리가 직접 엽니다 — 그래야 끝났을 때 앱으로 돌아온 걸 압니다.
          skipBrowserRedirect: true,
          // 카카오는 이메일 동의항목을 쓰지 않습니다 — 닉네임·프로필 사진만 요청합니다.
          ...(provider === "kakao" ? { scopes: "profile_nickname profile_image" } : {}),
        },
      });
      if (err) throw new Error(err.message);
      if (!data.url) throw new Error("로그인 주소를 받지 못했습니다");

      const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT);
      if (result.type !== "success") {
        setBusy(null);
        return;
      }

      const code = ExpoLinking.parse(result.url).queryParams?.code;
      if (typeof code !== "string") throw new Error("로그인 코드를 받지 못했습니다");

      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeErr) throw new Error(exchangeErr.message);

      // 세션이 들어오면 루트 레이아웃의 문지기가 알아서 다음 화면으로 보냅니다.
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다");
      setBusy(null);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.paper,
        paddingHorizontal: 30,
        paddingTop: insets.top + 90,
        paddingBottom: insets.bottom + 20,
      }}
    >
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontFamily: FONT.serifBold, fontSize: 58, letterSpacing: 8, color: C.ink }}>DINARY</Text>
        <Text style={{ marginTop: 12, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>
          다이닝에 다이어리를 더하다.
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ gap: 11 }}>
        {KAKAO_ENABLED && (
          <Pressable
            onPress={() => login("kakao")}
            disabled={busy !== null}
            style={{
              minHeight: 54,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: 16,
              backgroundColor: C.kakao,
              paddingHorizontal: 18,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <KakaoIcon />
            <Text style={{ flex: 1, fontSize: 15, color: C.ink, fontFamily: FONT.sansMedium }}>
              {busy === "kakao" ? "연결하는 중…" : "카카오로 시작하기"}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => login("google")}
          disabled={busy !== null}
          style={{
            minHeight: 54,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.card,
            paddingHorizontal: 18,
            opacity: busy ? 0.7 : 1,
          }}
        >
          <GoogleIcon />
          <Text style={{ flex: 1, fontSize: 15, color: C.ink, fontFamily: FONT.sansMedium }}>
            {busy === "google" ? "연결하는 중…" : "Google로 시작하기"}
          </Text>
        </Pressable>

        {error.length > 0 && (
          <Text style={{ paddingTop: 4, textAlign: "center", fontSize: 12, color: C.brick, fontFamily: FONT.sans }}>
            {error}
          </Text>
        )}
      </View>

      <Text style={{ marginTop: 18, textAlign: "center", fontSize: 11, lineHeight: 19, color: C.faint, fontFamily: FONT.sans }}>
        계속하면{" "}
        <Text onPress={() => void Linking.openURL("https://dinary.app/terms")} style={{ color: C.brick }}>
          이용약관
        </Text>
        과{" "}
        <Text onPress={() => void Linking.openURL("https://dinary.app/privacy")} style={{ color: C.brick }}>
          개인정보 처리방침
        </Text>
        에 동의하는 것으로 봅니다.
      </Text>
    </View>
  );
}

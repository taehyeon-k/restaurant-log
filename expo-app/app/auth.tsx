import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { finishOAuth } from "@/lib/auth";
import { C } from "@/theme";

/**
 * dinary://auth 딥링크 도착지 — 안드로이드는 OAuth 리디렉트를 인앱 브라우저 대신 라우터로 보내기도 해서
 * 이 화면이 없으면 "Unmatched Route" 가 뜹니다. 세션을 연 뒤의 이동은 _layout 의 Gate 가 맡습니다.
 */
export default function AuthRedirect() {
  const url = Linking.useLinkingURL();
  const router = useRouter();

  useEffect(() => {
    // 링크 없이 열렸으면(세션도 없으면 Gate 가 그대로 두므로) 잠깐 기다렸다가 로그인 화면으로 돌아갑니다.
    if (!url) {
      const t = setTimeout(() => router.replace("/login"), 5000);
      return () => clearTimeout(t);
    }
    let alive = true;
    finishOAuth(url).then((error) => {
      if (alive && error) router.replace({ pathname: "/login", params: { error } });
    });
    return () => { alive = false; };
  }, [url, router]);

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={C.brick} />
    </View>
  );
}

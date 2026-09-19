import "../global.css";

import { useEffect, useRef, useState } from "react";
import { Stack, router, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useFonts } from "expo-font";
import type { Session } from "@supabase/supabase-js";

// 쓰는 웨이트만 경로로 집어 옵니다 — 패키지 index 를 통째로 가져오면 안 쓰는
// 한글 웨이트(하나에 5MB 안팎)까지 전부 번들에 들어갑니다.
const GowunBatang_400Regular = require("@expo-google-fonts/gowun-batang/GowunBatang_400Regular.ttf");
const GowunBatang_700Bold = require("@expo-google-fonts/gowun-batang/GowunBatang_700Bold.ttf");
const NotoSansKR_400Regular = require("@expo-google-fonts/noto-sans-kr/NotoSansKR_400Regular.ttf");
const NotoSansKR_500Medium = require("@expo-google-fonts/noto-sans-kr/NotoSansKR_500Medium.ttf");
const NotoSansKR_700Bold = require("@expo-google-fonts/noto-sans-kr/NotoSansKR_700Bold.ttf");
const JetBrainsMono_400Regular = require("@expo-google-fonts/jetbrains-mono/JetBrainsMono_400Regular.ttf");
const JetBrainsMono_500Medium = require("@expo-google-fonts/jetbrains-mono/JetBrainsMono_500Medium.ttf");

import { supabase, startAuthRefreshWatcher } from "@/lib/supabase";
import { keys, refreshAll, useAccount, useWishes } from "@/lib/data";
import { startQueueWatcher } from "@/lib/offline";
import { currentPositionOrNull, syncWishGeofences } from "@/lib/notifications";
import { C } from "@/lib/theme";

// 한글 웨이트가 무거워 첫 그림이 늦습니다 — 다 읽을 때까지 스플래시를 붙들어
// 세리프가 기본 글꼴로 한 번 번쩍이는 것을 막습니다.
void SplashScreen.preventAutoHideAsync();

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    GowunBatang_400Regular,
    GowunBatang_700Bold,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(C.paper);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.paper }}>
      <QueryClientProvider client={client}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <AppShell />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/**
 * 로그인 문지기 + 앱 전역 구독. 웹에서는 `page.tsx` 의 `redirect("/login")` 과
 * `welcome/page.tsx` 가 하던 일입니다.
 */
function AppShell() {
  const queryClient = useQueryClient();
  const segments = useSegments();
  const nav = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const { data: account, isFetched: accountFetched } = useAccount();
  const { wishes } = useWishes();

  useEffect(() => startAuthRefreshWatcher(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      queryClient.setQueryData(keys.session, next);
      refreshAll(queryClient);
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // 미전송 기록은 연결이 돌아오거나 앱이 앞으로 나올 때 올라갑니다(§6).
  useEffect(
    () => startQueueWatcher(() => refreshAll(queryClient)),
    [queryClient]
  );

  /**
   * 감시 구역은 앱을 켤 때마다 위시 목록에 맞춰 다시 세웁니다(§7) — iOS 20개
   * 제한 때문에 가까운 순으로 자르는데, 그 기준이 바뀌기 때문입니다. 권한이
   * 없으면 syncWishGeofences 가 조용히 물러납니다.
   */
  useEffect(() => {
    if (!session || wishes.length === 0) return;
    void currentPositionOrNull().then((from) => syncWishGeofences(wishes, from));
  }, [session, wishes]);

  // 위시 근처 알림을 누르면 그 위시를 인증 대상으로 들고 곧바로 카메라를 엽니다(§7).
  const handledNotification = useRef<string | null>(null);
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledNotification.current === id) return;
      handledNotification.current = id;

      const wishId = response.notification.request.content.data?.wishId;
      if (typeof wishId === "string") {
        router.push({ pathname: "/capture", params: { verifyWishId: wishId } });
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((r) => r && open(r));
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  const inAuthFlow = segments[0] === "login" || segments[0] === "welcome";

  useEffect(() => {
    if (!authReady) return;

    if (!session) {
      if (segments[0] !== "login") nav.replace("/login");
      return;
    }

    // 닉네임이 없으면 첫 로그인입니다 — 이름을 정하기 전에는 기록 화면을 열지 않습니다.
    if (accountFetched && !account?.nickname) {
      if (segments[0] !== "welcome") nav.replace("/welcome");
      return;
    }

    if (inAuthFlow && account?.nickname) nav.replace("/");
  }, [authReady, session, account, accountFetched, segments, inAuthFlow, nav]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="capture"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="wish/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="login" options={{ animation: "fade" }} />
      <Stack.Screen name="welcome" options={{ animation: "fade", gestureEnabled: false }} />
    </Stack>
  );
}

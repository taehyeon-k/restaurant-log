import { GowunBatang_700Bold } from "@expo-google-fonts/gowun-batang";
import { NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold } from "@expo-google-fonts/noto-sans-kr";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAccount } from "@/data/profile";
import { useWishes } from "@/data/queries";
import { startQueueTriggers } from "@/features/queue/process";
// 이 import 가 백그라운드 지오펜스 태스크를 정의합니다 — 반드시 앱 진입점에서 불러야 합니다.
import { syncWishGeofences } from "@/features/notify/geofence";
import { supabase } from "@/lib/supabase";
import { C } from "@/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** undefined = 아직 모름, null = 로그아웃. */
function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const session = useSession();
  const segments = useSegments();
  const router = useRouter();
  const qc = useQueryClient();
  // 로그아웃·탈퇴하면 다른 계정의 캐시가 남지 않게 비웁니다.
  useEffect(() => { if (session === null) qc.clear(); }, [session, qc]);

  // 로그인한 계정이 바뀌면 캐시를 새로 읽습니다.
  const userId = session?.user.id;
  useEffect(() => { if (userId) void qc.invalidateQueries(); }, [userId, qc]);

  const { data: account, isPending: accountPending } = useAccount();
  const { data: wishes } = useWishes();

  const ready = fontsLoaded && session !== undefined && (!session || !accountPending);
  const first = segments[0] as string | undefined;

  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);

  // 로그인 · 닉네임(첫 로그인) 분기 — 웹의 proxy.ts / auth/callback 이 하던 일.
  useEffect(() => {
    if (!ready) return;
    // /auth 는 OAuth 딥링크가 세션을 여는 중이라 그대로 둡니다.
    if (!session) { if (first !== "login" && first !== "auth") router.replace("/login"); return; }
    if (!account?.nickname) { if (first !== "welcome") router.replace("/welcome"); return; }
    if (first === "login" || first === "welcome" || first === "auth") router.replace("/");
  }, [ready, session, account?.nickname, first, router]);

  // 오프라인 큐 — 앱 복귀·연결 복구에서 비웁니다.
  useEffect(() => (session ? startQueueTriggers(qc) : undefined), [session, qc]);

  // 위시가 바뀔 때마다 가까운 20곳으로 지오펜스를 다시 맞춥니다.
  useEffect(() => { if (session && wishes) void syncWishGeofences(wishes); }, [session, wishes]);

  // 근처 알림을 누르면 그 위시를 인증 대상으로 카메라가 바로 열립니다.
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const wishId = last?.notification.request.content.data?.wishId as string | undefined;
    if (ready && session && wishId) router.push({ pathname: "/capture", params: { verifyWishId: wishId } });
  }, [last, ready, session, router]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="capture" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: false }} />
      <Stack.Screen name="record/edit" options={{ presentation: "modal" }} />
      <Stack.Screen name="wish/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="wish/spot" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="wish/[id]" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
      <Stack.Screen name="auth" />
      <Stack.Screen name="login" />
      <Stack.Screen name="welcome" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    GowunBatang_700Bold, NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold, JetBrainsMono_400Regular,
  });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Gate fontsLoaded={fontsLoaded} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

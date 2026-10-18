import { restoreShown } from "@/features/recommend/log";
import { GowunBatang_700Bold } from "@expo-google-fonts/gowun-batang";
import { NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold } from "@expo-google-fonts/noto-sans-kr";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { bootState } from "@/lib/reliability/boot";
import { BootScreen } from "@/components/BootScreen";
import { useBooks } from "@/data/books";
import { useSession } from "@/data/session";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAccount } from "@/data/profile";
import { useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import CommunityTransition from "@/features/community/Transition";
import { startQueueTriggers } from "@/features/queue/process";
// 이 import 가 백그라운드 지오펜스 태스크를 정의합니다 — 반드시 앱 진입점에서 불러야 합니다.
import { syncWishGeofences } from "@/features/notify/geofence";
import { C } from "@/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const session = useSession();
  const segments = useSegments();
  const router = useRouter();
  const qc = useQueryClient();
  // 로그아웃·탈퇴하면 다른 계정의 캐시가 남지 않게 비웁니다.
  useEffect(() => { if (session === null) qc.clear(); }, [session, qc]);

  // 로그인한 계정이 바뀌면 캐시를 새로 읽습니다.
  const userId = session?.user.id;
  useEffect(() => {
    setState({ recShown: [], recHeading: null, recCourse: null, recHere: null, recPlace: null, recAt: null, recFilter: null, ghost: null, linkPick: null });
    void restoreShown(userId ?? null);
    void syncWishGeofences([]);
    if (userId) void qc.invalidateQueries();
  }, [userId, qc]);

  const { data: account, isPending: accountPending, isError: accountError } = useAccount();
  const { data: wishes } = useWishes();
  const books = useBooks();
  const net = useNetInfo();
  const [boot, setBoot] = useState<{ owner: string | null | undefined; at: number; hidden: boolean }>(() => ({ owner: undefined, at: Date.now(), hidden: false }));
  const [captureEscape, setCaptureEscape] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bootOwner = session === undefined ? undefined : session?.user.id ?? null;
  const bootCurrent = boot.owner === bootOwner;
  useEffect(() => {
    if (bootOwner === undefined || !fontsLoaded) return;
    setBoot({ owner: bootOwner, at: Date.now(), hidden: false });
    setElapsed(0);
  }, [bootOwner, fontsLoaded]);
  useEffect(() => {
    if (boot.hidden) return;
    const timer = setInterval(() => setElapsed(Date.now() - boot.at), 100);
    return () => clearInterval(timer);
  }, [boot.at, boot.hidden]);
  const refetchBooks = books.refetch;
  useEffect(() => {
    if (!userId) return;
    const retry = () => { void refetchBooks(); };
    const off = NetInfo.addEventListener((n) => { if (n.isConnected && n.isInternetReachable !== false) retry(); });
    const app = AppState.addEventListener("change", (s) => { if (s === "active") retry(); });
    return () => { off(); app.remove(); };
  }, [userId, refetchBooks]);
  const hideBoot = useCallback(() => setBoot((b) => ({ ...b, hidden: true })), []);

  // 로그인 직후엔 로그아웃 때 받아 둔 캐시(null)가 남아 있습니다. 그걸로 분기하면 /welcome 으로 갔다가
  // 다시 읽은 뒤 홈으로 튕기므로, 지금 세션의 계정 정보가 올 때까지 기다립니다.
  const accountFresh = !accountPending && (account?.userId === session?.user.id || accountError);
  const ready = fontsLoaded && session !== undefined && (!session || accountFresh);
  const first = segments[0] as string | undefined;

  // Hand off the native splash even when the network/profile is unavailable.
  useEffect(() => { if (fontsLoaded && session !== undefined) void SplashScreen.hideAsync(); }, [fontsLoaded, session]);
  const booksResolved = !session || books.isSuccess;
  const bootStatus = bootState({ elapsed, ready: ready && bootCurrent, resolved: booksResolved,
    offline: net.isConnected === false || net.isInternetReachable === false, fetching: books.isFetching, error: books.isError });
  useEffect(() => { if (first === "capture") setCaptureEscape(true); else if (first !== "record") setCaptureEscape(false); }, [first]);
  const showBoot = (!bootCurrent || !boot.hidden) && first !== "capture" && !(captureEscape && first === "record" && segments[1] === "edit");

  // 로그인 · 닉네임(첫 로그인) 분기 — 웹의 proxy.ts / auth/callback 이 하던 일.
  useEffect(() => {
    if (!ready) return;
    // /auth 는 OAuth 딥링크가 세션을 여는 중이라 그대로 둡니다.
    if (!session) { if (first !== "login" && first !== "auth") router.replace("/login"); return; }
    if (!account?.nickname) { if (first !== "welcome") router.replace("/welcome"); return; }
    if (first === "login" || first === "welcome" || first === "auth") router.replace("/");
  }, [ready, session, account?.nickname, first, router]);

  // 오프라인 큐 — 앱 복귀·연결 복구에서 비웁니다.
  useEffect(() => (userId ? startQueueTriggers(qc) : undefined), [userId, qc]);

  // 위시가 바뀔 때마다 가까운 20곳으로 지오펜스를 다시 맞춥니다.
  useEffect(() => { if (session && wishes) void syncWishGeofences(wishes); }, [session, wishes]);

  // 근처 알림을 누르면 그 위시를 인증 대상으로 카메라가 바로 열립니다.
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const wishId = last?.notification.request.content.data?.wishId as string | undefined;
    if (ready && session && wishId) router.push({ pathname: "/capture", params: { verifyWishId: wishId } });
  }, [last, ready, session, router]);

  // 공유 시트(릴스 · 쇼츠 …)로 받은 글 — 담아두고, 로그인 · 닉네임까지 끝난 뒤 위시 폼으로 넘깁니다.
  // 폼이 받은 글을 판별해 유튜브 · 인스타 링크면 「어느 가게인가요」를 위에 띄우고, 아니면 링크 입력창에 오류와 함께 둡니다.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const { pendingShare } = useAppState();
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = [shareIntent.webUrl, shareIntent.text].filter(Boolean).join(" ").trim();
    resetShareIntent();
    if (text) setState({ pendingShare: text });
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  const signedIn = ready && !!session && !!account?.nickname && first !== "login" && first !== "welcome" && first !== "auth";
  useEffect(() => {
    if (!signedIn || !pendingShare) return;
    setState({ pendingShare: null });
    router.push({ pathname: "/wish/new", params: { share: pendingShare } });
  }, [signedIn, pendingShare, router]);

  if (!fontsLoaded || session === undefined) return null;

  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="(tabs)" />
      {/* 커뮤니티 — 들어갈 때는 전환 판이 덮고, 나갈 때(‹ 내 기록 · 밀기)는 판 없이 아래로 내려갑니다. */}
      <Stack.Screen name="community" options={{ animation: "slide_from_bottom", gestureEnabled: true }} />
      <Stack.Screen name="capture" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: false }} />
      <Stack.Screen name="record/edit" options={{ presentation: "modal" }} />
      <Stack.Screen name="wish/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="wish/link" options={{ presentation: "modal" }} />
      <Stack.Screen name="wish/[id]" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
      <Stack.Screen name="couple/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="couple/join" options={{ presentation: "modal" }} />
      <Stack.Screen name="recap/[quarter]" options={{ presentation: "fullScreenModal", animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="label-recap" options={{ presentation: "fullScreenModal", animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="auth" />
      <Stack.Screen name="login" />
      <Stack.Screen name="welcome" />
    </Stack>
    {/* 커뮤니티 들어가기 전환 판 — 상태 표시줄까지 모든 화면 위 */}
    <CommunityTransition />
    {showBoot && <BootScreen key={bootOwner ?? "signed-out"} state={bootStatus} characterId={account && account.userId === userId ? account.characterId : undefined}
      fetching={books.isFetching} onRetry={() => { void books.refetch(); }}
      onCapture={session && account && account.userId === userId && account.nickname ? () => { setCaptureEscape(true); router.push("/capture"); } : undefined} onHidden={hideBoot} />}
    </>
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

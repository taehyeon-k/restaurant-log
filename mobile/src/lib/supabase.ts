import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없습니다. mobile/.env 를 보세요."
  );
}

/**
 * 네이티브 supabase — 세션은 AsyncStorage 에 남습니다.
 * `detectSessionInUrl` 은 반드시 false 입니다(브라우저 주소창이 없습니다).
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // 앱에서는 PKCE 로 받습니다 — 리디렉션이 `dinary://auth` 스킴으로 돌아오고,
    // 코드를 세션으로 바꾸는 일은 login 화면이 직접 합니다.
    flowType: "pkce",
  },
});

/**
 * 앱이 앞에 있을 때만 토큰을 갱신합니다 — 뒤로 가면 멈춰야 배터리를 쓰지 않습니다.
 * 앱이 시작될 때 한 번만 부르세요(루트 레이아웃).
 */
export function startAuthRefreshWatcher() {
  const apply = (state: string) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };

  apply(AppState.currentState);
  const sub = AppState.addEventListener("change", apply);
  return () => sub.remove();
}

/** 지금 로그인한 사용자 id. 없으면 던집니다 — 저장 경로가 모두 이걸 씁니다. */
export async function requireUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return user.id;
}

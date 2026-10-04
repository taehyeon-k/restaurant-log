import { supabase } from "@/lib/supabase";

/** 돌아온 dinary://auth?…#… 의 쿼리와 해시를 한데 모읍니다 — 토큰은 해시로, 에러는 둘 중 어디로든 옵니다. */
function readParams(url: string) {
  const params = new URLSearchParams(url.split("?")[1]?.split("#")[0] ?? "");
  new URLSearchParams(url.split("#")[1] ?? "").forEach((v, k) => params.set(k, v));
  return params;
}

// 같은 리디렉트 URL 을 로그인 화면(openAuthSessionAsync)과 /auth 라우트가 함께 받을 수 있어 한 번만 처리합니다.
const handled = new Map<string, Promise<string | null>>();

/**
 * OAuth 리디렉트 URL 로 세션을 엽니다 — 성공하면 null, 실패하면 보여줄 에러 문구.
 * 세션이 열리면 _layout 의 onAuthStateChange 가 알아서 홈·welcome 으로 보냅니다.
 */
export function finishOAuth(url: string): Promise<string | null> {
  let job = handled.get(url);
  if (!job) {
    job = (async () => {
      const params = readParams(url);
      const failure = params.get("error_description") ?? params.get("error");
      if (failure) return failure.replace(/\+/g, " ");

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return "로그인 정보를 받지 못했습니다";

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      return error?.message ?? null;
    })();
    handled.set(url, job);
  }
  return job;
}

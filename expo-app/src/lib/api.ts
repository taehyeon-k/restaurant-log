import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/**
 * 배포된 Next.js 의 /api/* 호출. 앱에는 쿠키가 없으니 Supabase 세션 토큰을
 * Authorization: Bearer 로 실어 보냅니다(웹의 proxy.ts 가 그 토큰을 검증합니다).
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

import { createClient } from "@supabase/supabase-js";

/**
 * 서비스 롤 키로 만드는 관리자 클라이언트. 회원 탈퇴(auth.users 행 자체를
 * 지우는 일)처럼 본인 권한(anon key + RLS)으로는 할 수 없는 작업에만 씁니다.
 * SUPABASE_SERVICE_ROLE_KEY 는 서버 전용 비밀값 — NEXT_PUBLIC_ 접두어를 붙이지
 * 말고, "use client" 파일에서는 절대 이 모듈을 가져다 쓰지 마세요.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

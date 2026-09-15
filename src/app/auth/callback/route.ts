import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth 리디렉션 도착지. 코드를 세션으로 바꾼 뒤, 프로필에 닉네임이
 * 비어 있으면(첫 로그인) /welcome 으로, 있으면 홈으로 보냅니다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", data.user.id)
        .single();

      return NextResponse.redirect(`${origin}${profile?.nickname ? "/" : "/welcome"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

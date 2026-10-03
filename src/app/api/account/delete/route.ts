import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 회원 탈퇴. auth.users 행을 지우면 restaurants·wishes·profiles 가
 * on delete cascade 로 함께 지워집니다(§2 마이그레이션). 사진 스토리지 정리는
 * 아직 미룬 일이라(§2 끝) 여기서 손대지 않습니다.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  // 웹은 쿠키 세션, 네이티브 앱은 Authorization: Bearer 토큰으로 부릅니다.
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const {
    data: { user },
  } = await supabase.auth.getUser(bearer);

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

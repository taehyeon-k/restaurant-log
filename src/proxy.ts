import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 없이 열려야 하는 경로.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/privacy", "/terms"];

/**
 * 모든 요청 앞에서 세션을 갱신하고, 세션이 없으면 /login 으로 보냅니다.
 * (Next.js 16: middleware.ts 는 proxy.ts 로 이름이 바뀌었습니다.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // 네이티브 앱(Expo)은 쿠키가 없어 Authorization: Bearer 로 /api/* 를 부릅니다 — 그 토큰도 같은 방식으로 검증합니다.
  const bearer = request.nextUrl.pathname.startsWith("/api/")
    ? request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
    : undefined;

  // getSession()이 아니라 getUser() — 토큰을 Supabase 서버에 검증받습니다.
  const {
    data: { user },
  } = await supabase.auth.getUser(bearer);

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

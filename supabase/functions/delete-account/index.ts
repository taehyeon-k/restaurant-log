/**
 * 회원 탈퇴 — 네이티브 앱용. 웹의 `src/app/api/account/delete/route.ts` 와 같은 일을
 * 합니다: auth.users 행을 지우면 restaurants·wishes·profiles 가 on delete cascade 로
 * 함께 지워집니다. 사진 스토리지 정리는 아직 미룬 일이라 여기서 손대지 않습니다.
 *
 * 앱에는 서버 라우트가 없고 서비스 롤 키를 담을 수도 없어서, 그 권한이 필요한 일만
 * 이 엣지 함수로 옮겼습니다.
 *
 *   supabase functions deploy delete-account
 *
 * SUPABASE_SERVICE_ROLE_KEY 와 SUPABASE_URL 은 엣지 런타임이 넣어 줍니다.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "로그인이 필요합니다" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;

  // 호출한 사람이 누구인지는 그 사람의 토큰으로 확인합니다 — id 를 몸통으로
  // 받으면 남의 계정을 지울 수 있습니다.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
  } = await asCaller.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});

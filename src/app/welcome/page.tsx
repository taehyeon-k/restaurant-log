import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomeScreen from "./WelcomeScreen";

export const metadata: Metadata = {
  title: "닉네임 — DINARY",
};

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", user.id)
    .single();

  // 이미 닉네임을 정한 계정이 주소를 직접 열면 다시 물을 필요가 없습니다.
  if (profile?.nickname) redirect("/");

  const meta = user.user_metadata as Record<string, unknown> | null;
  const metaName = (meta?.name as string) || (meta?.full_name as string) || "";
  const metaAvatar = (meta?.avatar_url as string) || (meta?.picture as string) || null;
  const provider = user.app_metadata?.provider === "google" ? "구글" : "카카오";

  return (
    <WelcomeScreen
      initialNickname={metaName.slice(0, 12)}
      initialAvatarUrl={profile?.avatar_url ?? metaAvatar}
      fromOAuth={Boolean(metaName)}
      provider={provider}
    />
  );
}

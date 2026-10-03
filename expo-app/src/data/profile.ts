import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AccountInfo = {
  nickname: string;
  avatarUrl: string | null;
  since: string;
  providers: string[];
  titleLabelId: string | null;
};

export const useAccount = () =>
  useQuery({
    queryKey: ["account"],
    queryFn: async (): Promise<AccountInfo | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("nickname, avatar_url, created_at, title_label_id")
        .eq("id", user.id)
        .single();
      // 새 컬럼 마이그레이션이 밀렸을 때 닉네임이 "이름 없음"으로만 보이는 착오를 막기 위해 남깁니다.
      if (error) console.error("profiles 조회 실패 — 마이그레이션이 밀렸을 수 있습니다:", error);
      return {
        nickname: profile?.nickname ?? "",
        avatarUrl: profile?.avatar_url ?? null,
        since: profile?.created_at ?? user.created_at,
        providers: (user.identities ?? []).map((i) => i.provider),
        titleLabelId: profile?.title_label_id ?? null,
      };
    },
  });

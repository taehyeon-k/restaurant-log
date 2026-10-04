import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AccountInfo = {
  /** 이 정보가 어느 계정의 것인지 — 로그인 직후 이전(로그아웃 때) 캐시와 구별하는 데 씁니다. */
  userId: string;
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
      // getUser 는 네트워크를 타서, 오프라인이면 세션이 있어도 null 을 줍니다 — 그러면 Gate 가 계정 정보를
      // 영영 기다리게 되니, 기기에 저장된 세션의 user 를 씁니다(프로필 조회는 어차피 RLS 가 막습니다).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("nickname, avatar_url, created_at, title_label_id")
        .eq("id", user.id)
        .single();
      // 새 컬럼 마이그레이션이 밀렸을 때 닉네임이 "이름 없음"으로만 보이는 착오를 막기 위해 남깁니다.
      if (error) console.error("profiles 조회 실패 — 마이그레이션이 밀렸을 수 있습니다:", error);
      return {
        userId: user.id,
        nickname: profile?.nickname ?? "",
        avatarUrl: profile?.avatar_url ?? null,
        since: profile?.created_at ?? user.created_at,
        providers: (user.identities ?? []).map((i) => i.provider),
        titleLabelId: profile?.title_label_id ?? null,
      };
    },
  });

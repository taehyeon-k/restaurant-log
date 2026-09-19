/**
 * 전역 데이터 — 웹의 `MobileShell.tsx` 가 props 로 들고 있던 것을 라우트 위로 올립니다(§5).
 * 거르기·정렬·묶기는 여전히 기기에서 합니다(시트가 서버를 오가지 않고 바로 반응합니다).
 */
import { useCallback } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Restaurant, Wish } from "@/lib/types";

export type AccountInfo = {
  nickname: string;
  avatarUrl: string | null;
  /** 프로필이 만들어진 시각(ISO) — SINCE 표시에 씁니다. */
  since: string;
  /** 연결된 로그인 수단, 예: ["kakao"] */
  providers: string[];
  /** 닉네임 옆에 내건 대표 라벨(src/lib/labels.ts LABELS 의 id). 없으면 null. */
  titleLabelId: string | null;
};

export const keys = {
  session: ["session"] as const,
  restaurants: ["restaurants"] as const,
  wishes: ["wishes"] as const,
  account: ["account"] as const,
};

/**
 * 모바일 화면이 쓰는 전체 목록. 조건 없이 한 번만 읽습니다.
 */
async function fetchRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("visited_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Restaurant[];
}

/**
 * 가고싶다 전체 목록 — 위시리스트 탭·월력·지도가 함께 씁니다.
 * 위시를 못 읽어도(마이그레이션 전이거나 일시적 오류) 기록 화면은 그대로 열려야
 * 하므로 던지지 않고 빈 배열을 돌려줍니다.
 */
async function fetchWishes(): Promise<Wish[]> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .order("plan_date", { ascending: true, nullsFirst: false })
    .order("saved_at", { ascending: false });

  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as Wish[];
}

async function fetchAccount(): Promise<AccountInfo | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("nickname, avatar_url, created_at, title_label_id")
    .eq("id", user.id)
    .single();

  // 이 select 가 실패하면(예: title_label_id 처럼 새 컬럼을 추가한 마이그레이션이
  // 아직 안 돌았을 때) profile 이 조용히 null 이 되고, 닉네임이 실제로는 저장돼
  // 있어도 "이름 없음"으로만 보입니다. 그런 착오를 막으려 원인을 남깁니다.
  if (error) {
    console.error("profiles 조회 실패 — 마이그레이션이 밀렸을 수 있습니다:", error.message);
  }

  return {
    nickname: profile?.nickname ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    since: profile?.created_at ?? user.created_at,
    providers: (user.identities ?? []).map((i) => i.provider),
    titleLabelId: profile?.title_label_id ?? null,
  };
}

export function useSession() {
  return useQuery<Session | null>({
    queryKey: keys.session,
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: Infinity,
  });
}

export function useRestaurants() {
  const q = useQuery({ queryKey: keys.restaurants, queryFn: fetchRestaurants });
  return { ...q, rows: q.data ?? [] };
}

export function useWishes() {
  const q = useQuery({ queryKey: keys.wishes, queryFn: fetchWishes });
  return { ...q, wishes: q.data ?? [] };
}

export function useAccount() {
  return useQuery({ queryKey: keys.account, queryFn: fetchAccount });
}

/** 웹의 `router.refresh()` 자리 — 저장·삭제 뒤에 목록을 다시 읽습니다. */
export function useRefresh() {
  const client = useQueryClient();
  return useCallback(() => {
    client.invalidateQueries({ queryKey: keys.restaurants });
    client.invalidateQueries({ queryKey: keys.wishes });
    client.invalidateQueries({ queryKey: keys.account });
  }, [client]);
}

export function refreshAll(client: QueryClient) {
  client.invalidateQueries({ queryKey: keys.restaurants });
  client.invalidateQueries({ queryKey: keys.wishes });
  client.invalidateQueries({ queryKey: keys.account });
}

/**
 * 지난 예정 처리 — plan_date 가 오늘보다 이르면 조용히 null 로 되돌립니다("언젠가"로).
 * 바뀐 게 있으면 true 를 돌려주니 호출한 쪽이 목록을 다시 읽으면 됩니다.
 */
export async function releasePastWishes(wishes: Wish[]) {
  const today = new Date().toISOString().slice(0, 10);
  const stale = wishes.filter((w) => w.plan_date && w.plan_date < today);
  if (!stale.length) return false;

  const { error } = await supabase
    .from("wishes")
    .update({ plan_date: null })
    .in("id", stale.map((w) => w.id));

  if (error) {
    console.error(error.message);
    return false;
  }
  return true;
}

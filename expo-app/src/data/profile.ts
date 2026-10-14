import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { usePersonalRows } from "@/data/queries";
import { DEFAULT_CHARACTER, VERIFIED_PER_TICKET, isCharacterId, type CharacterId } from "@/lib/characters";
import { earnedLabels, regionTitles, REGION_TIERS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

export type AccountInfo = {
  /** 이 정보가 어느 계정의 것인지 — 로그인 직후 이전(로그아웃 때) 캐시와 구별하는 데 씁니다. */
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  since: string;
  providers: string[];
  titleLabelId: string | null;
  /** 닉네임 옆 대표 캐릭터 */
  characterId: CharacterId;
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
      // 컬럼을 나열하지 않고 * 로 읽습니다 — 새 컬럼(character_id) 마이그레이션이 밀려도 닉네임까지 비어
      // 첫 로그인 화면으로 튕기지 않게.
      const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      // 마이그레이션이 밀렸을 때 닉네임이 "이름 없음"으로만 보이는 착오를 막기 위해 남깁니다.
      if (error) console.error("profiles 조회 실패 — 마이그레이션이 밀렸을 수 있습니다:", error);
      return {
        userId: user.id,
        nickname: profile?.nickname ?? "",
        avatarUrl: profile?.avatar_url ?? null,
        since: profile?.created_at ?? user.created_at,
        providers: (user.identities ?? []).map((i) => i.provider),
        titleLabelId: profile?.title_label_id ?? null,
        characterId: isCharacterId(profile?.character_id) ? profile.character_id : DEFAULT_CHARACTER,
      };
    },
  });

/* ───────────── 캐릭터 · 뽑기권 (HANDOFF-characters.md §2) ───────────── */

/** 인증되고 보관함이 아닌 기록 수 — DB available_tickets 와 같은 기준. */
export const verifiedCount = (rows: Restaurant[]) => rows.filter((r) => r.verified && !r.pending).length;

/**
 * 받은 라벨 수(동네 칭호 포함) — 뽑기권 계산에 씁니다. 동네 칭호는 오른 등급마다 1개(동·은·금)로 셉니다.
 * TODO(랭킹 전): 앱이 넘기는 값이라 조작할 수 있습니다. 랭킹 전에 DB 로 옮기세요.
 */
export const receivedLabelCount = (rows: Restaurant[]) =>
  earnedLabels(rows).filter((l) => l.earned).length +
  regionTitles(rows).reduce((n, t) => n + (t.tier ? REGION_TIERS.indexOf(t.tier) + 1 : 0), 0);

export type OwnedCharacter = { id: CharacterId; count: number };

/** 가진 캐릭터. 빈 접시는 가입 때 받으니 표에 없더라도(마이그레이션 전) 하나는 있는 것으로 봅니다. */
export const useOwnedCharacters = () =>
  useQuery({
    queryKey: ["characters", "owned"],
    queryFn: async (): Promise<OwnedCharacter[]> => {
      const { data, error } = await supabase.from("user_characters").select("character_id, count");
      if (error) console.error("user_characters 조회 실패 — 마이그레이션이 밀렸을 수 있습니다:", error);
      const owned = (data ?? [])
        .filter((r) => isCharacterId(r.character_id))
        .map((r) => ({ id: r.character_id as CharacterId, count: r.count as number }));
      if (!owned.some((o) => o.id === DEFAULT_CHARACTER)) owned.unshift({ id: DEFAULT_CHARACTER, count: 1 });
      return owned;
    },
  });

/** 쓸 수 있는 뽑기권 · 다음 장까지 남은 인증 기록. */
export function useTickets() {
  const { data: rows = [], isSuccess } = usePersonalRows();
  const labelCount = receivedLabelCount(rows);
  const verified = verifiedCount(rows);
  const q = useQuery({
    queryKey: ["characters", "tickets", labelCount, verified],
    enabled: isSuccess,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("available_tickets", { p_label_count: labelCount });
      if (error) {
        console.error("available_tickets 실패 — 마이그레이션이 밀렸을 수 있습니다:", error);
        return 0;
      }
      return Math.max(0, Number(data) || 0);
    },
  });
  return {
    tickets: q.data ?? 0,
    labelCount,
    verified,
    /** 다음 장까지 남은 인증 기록 수 */
    untilNext: VERIFIED_PER_TICKET - (verified % VERIFIED_PER_TICKET),
    loading: q.isPending,
  };
}

export type DrawResult = {
  character_id: CharacterId;
  count: number;
  is_new: boolean;
  converted: boolean;
  tickets_left: number;
};

/** 밥솥 열기 — 서버가 등급·캐릭터를 정하고 뽑기권을 씁니다. 뽑기권이 없으면 "no_ticket" 으로 실패합니다. */
export async function drawCharacter(labelCount: number): Promise<DrawResult> {
  const { data, error } = await supabase.rpc("draw_character", { p_label_count: labelCount });
  if (error) throw new Error(error.message.includes("no_ticket") ? "no_ticket" : error.message);
  return data as DrawResult;
}

/** 대표 캐릭터 바꾸기 — 가진 것만(DB 트리거도 한 번 더 확인합니다). */
export function useSetCharacter() {
  const qc = useQueryClient();
  return (userId: string, id: CharacterId) => setCharacter(qc, userId, id);
}

async function setCharacter(qc: QueryClient, userId: string, id: CharacterId) {
  const owned = qc.getQueryData<OwnedCharacter[]>(["characters", "owned"]);
  if (owned && !owned.some((o) => o.id === id)) throw new Error("아직 없는 캐릭터입니다");
  qc.setQueryData<AccountInfo | null>(["account"], (a) => (a ? { ...a, characterId: id } : a));
  const { error } = await supabase.from("profiles").update({ character_id: id }).eq("id", userId);
  if (error) {
    await qc.invalidateQueries({ queryKey: ["account"] });
    throw new Error(error.message.includes("character_not_owned") ? "아직 없는 캐릭터입니다" : error.message);
  }
}

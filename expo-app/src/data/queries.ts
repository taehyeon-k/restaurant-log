import { fetchAll } from "@/lib/reliability/pagination";
import { useSession } from "@/data/session";
import { useQuery } from "@tanstack/react-query";
import { useActiveBook, usePersonalBook } from "@/data/books";
import { supabase } from "@/lib/supabase";
import type { Restaurant, Wish } from "@/lib/types";

/**
 * 한 기록장의 기록. bookId 가 null 이면 읽지 않습니다.
 * 키가 ["restaurants", …] 라서 refreshAll 의 ["restaurants"] 무효화가 모든 기록장에 닿습니다.
 */
export const useBookRows = (bookId: string | null, ready: boolean) => {
  const ownerId = useSession()?.user.id;
  return useQuery({
    queryKey: ["restaurants", bookId, ownerId],
    enabled: ready && !!bookId && !!ownerId,
    queryFn: async () => {
      return fetchAll<Restaurant>((from, to) => supabase.from("restaurants").select("*").eq("book_id", bookId!)
        .order("visited_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).range(from, to));
    },
  });
};

/** 웹 MobileShell 이 들고 있던 rows 를 라우트 위로 올린 것 — 지금 고른 기록장(HANDOFF-couple §3-1)의 기록. */
export const useRows = () => {
  const { id, ready } = useActiveBook();
  return useBookRows(id, ready);
};

/** 개인 기록장의 기록 — 라벨·캐릭터 뽑기권·분기 리캡은 연인 기록과 섞지 않습니다. */
export const usePersonalRows = () => {
  const { id, ready } = usePersonalBook();
  return useBookRows(id, ready);
};

/** 위시 + 그 그룹(이름 · 출처) 한 번에. */
const WISH_SELECT = "*, group:wish_groups(id, name, source_url, source_kind, source_title, source_author)";

const useBookWishes = (bookId: string | null, ready: boolean) => {
  const ownerId = useSession()?.user.id;
  return useQuery({
    queryKey: ["wishes", bookId, ownerId],
    enabled: ready && !!bookId && !!ownerId,
    queryFn: async () => {
      return fetchAll<Wish>((from, to) => supabase.from("wishes").select(WISH_SELECT).eq("book_id", bookId!)
        .order("plan_date", { ascending: true, nullsFirst: false }).order("saved_at", { ascending: false }).order("id").range(from, to));
    },
  });
};

/** 지금 고른 기록장의 위시. 연인 기록장이면 둘이 함께 담은 목록입니다. */
export const useWishes = () => {
  const { id, ready } = useActiveBook();
  return useBookWishes(id, ready);
};

export const usePersonalWishes = () => {
  const { id, ready } = usePersonalBook();
  return useBookWishes(id, ready);
};

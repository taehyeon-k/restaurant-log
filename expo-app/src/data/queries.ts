import { useQuery } from "@tanstack/react-query";
import { useActiveBook, usePersonalBook } from "@/data/books";
import { supabase } from "@/lib/supabase";
import type { Restaurant, Wish } from "@/lib/types";

/**
 * 한 기록장의 기록. bookId 가 null 이면(마이그레이션 전) 기록장 구분 없이 읽습니다.
 * 키가 ["restaurants", …] 라서 refreshAll 의 ["restaurants"] 무효화가 모든 기록장에 닿습니다.
 */
export const useBookRows = (bookId: string | null, ready: boolean) =>
  useQuery({
    queryKey: ["restaurants", bookId],
    enabled: ready,
    queryFn: async () => {
      let q = supabase.from("restaurants").select("*");
      if (bookId) q = q.eq("book_id", bookId);
      const { data, error } = await q.order("visited_at", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Restaurant[];
    },
  });

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

const useBookWishes = (bookId: string | null, ready: boolean) =>
  useQuery({
    queryKey: ["wishes", bookId],
    enabled: ready,
    queryFn: async () => {
      let q = supabase.from("wishes").select("*");
      if (bookId) q = q.eq("book_id", bookId);
      const { data, error } = await q
        .order("plan_date", { ascending: true, nullsFirst: false })
        .order("saved_at", { ascending: false });
      if (error) {
        console.error(error.message);
        return [] as Wish[];
      }
      return (data ?? []) as Wish[];
    },
  });

/** 지금 고른 기록장의 위시. 연인 기록장이면 둘이 함께 담은 목록입니다. */
export const useWishes = () => {
  const { id, ready } = useActiveBook();
  return useBookWishes(id, ready);
};

export const usePersonalWishes = () => {
  const { id, ready } = usePersonalBook();
  return useBookWishes(id, ready);
};

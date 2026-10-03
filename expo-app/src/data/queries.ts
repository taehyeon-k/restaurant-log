import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Restaurant, Wish } from "@/lib/types";

/** 웹 MobileShell 이 들고 있던 rows / wishes 를 라우트 위로 올린 것. */
export const useRows = () =>
  useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("visited_at", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Restaurant[];
    },
  });

export const useWishes = () =>
  useQuery({
    queryKey: ["wishes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishes")
        .select("*")
        .order("plan_date", { ascending: true, nullsFirst: false })
        .order("saved_at", { ascending: false });
      if (error) {
        console.error(error.message);
        return [] as Wish[];
      }
      return (data ?? []) as Wish[];
    },
  });

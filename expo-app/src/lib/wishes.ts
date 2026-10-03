import type { SupabaseClient } from "@supabase/supabase-js";
import type { Wish } from "./types";

/** 자유 글에서 첫 URL만 뽑아냅니다 — 「출처 보기」 단추가 이걸 씁니다. */
export const firstUrl = (text: string | null) => text?.match(/https?:\/\/[^\s]+/)?.[0] ?? null;

/** 카드·시트에 보여줄 때는 URL 을 지운 본문만 보여줍니다. 편집칸 자체는 그대로 둡니다. */
export const noteWithoutUrl = (text: string | null, url: string | null) => {
  if (!text) return "";
  return (url ? text.replace(url, "") : text).replace(/\n{3,}/g, "\n\n").trim();
};

/**
 * 지난 예정 처리 — plan_date 가 오늘보다 이르면 조용히 null 로 되돌립니다("언젠가"로).
 * 바뀐 목록을 돌려주므로 호출한 쪽은 다시 불러오지 않아도 됩니다. 실패해도 원래 목록을 돌려줍니다.
 */
export async function releasePastWishes(client: SupabaseClient, wishes: Wish[]) {
  const today = new Date().toISOString().slice(0, 10);
  const stale = wishes.filter((w) => w.plan_date && w.plan_date < today);
  if (!stale.length) return wishes;

  const ids = stale.map((w) => w.id);
  const { error } = await client.from("wishes").update({ plan_date: null }).in("id", ids);
  if (error) {
    console.error(error.message);
    return wishes;
  }
  const staleIds = new Set(ids);
  return wishes.map((w) => (staleIds.has(w.id) ? { ...w, plan_date: null } : w));
}

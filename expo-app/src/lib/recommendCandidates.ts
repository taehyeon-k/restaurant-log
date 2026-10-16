import { apiFetch } from "./api";
import { supabase } from "./supabase";
import type { Candidate, RankedCandidate, RecommendationContext } from "./recommendRank";

/** 후보 검색은 카카오 REST 키가 있는 Next.js 서버에서만 수행합니다. */
export async function recommendationCandidates(lat: number, lng: number, radius = 1500): Promise<Candidate[]> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) });
  const response = await apiFetch(`/api/recommend/candidates?${params}`);
  if (!response.ok) throw new Error(`추천할 식당을 불러오지 못했어요 (${response.status})`);
  const json = await response.json() as { candidates?: Candidate[] };
  return json.candidates ?? [];
}

type EventName = "impression" | "open" | "wish_start";

/** 서버는 원시 GPS 좌표를 기록하지 않습니다. 이벤트에는 추천한 장소 ID와 랭킹 맥락만 저장합니다. */
export async function logRecommendationEvents(
  batchId: string, bookId: string | null, items: RankedCandidate[], context: RecommendationContext,
  event: EventName, candidateId?: string,
) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  const selected = candidateId ? items.filter((r) => r.id === candidateId) : items;
  if (!selected.length) return;
  const payload = selected.map((r) => ({
    user_id: userId, book_id: bookId, batch_id: batchId, candidate_id: r.id,
    event_type: event, position: items.findIndex((x) => x.id === r.id) + 1,
    context: { meal: context.meal, version: "hybrid-v1", source: "kakao", category: r.category, score: r.score },
  }));
  // 로그 실패는 추천 화면을 망가뜨리지 않습니다(마이그레이션 적용 전에도 동작).
  const { error } = await supabase.from("recommendation_events").insert(payload);
  if (error && __DEV__) console.warn("Recommendation analytics not saved:", error.message);
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

/**
 * 라벨 「· 새로」 표시 — 받은 뒤 아직 리캡을 열어 보지 않은 라벨. 기기에만 둡니다.
 * 처음 읽을 때(저장된 값이 없을 때)는 지금 받은 라벨을 모두 본 것으로 둡니다 — 업데이트 직후 전부 「새로」가 되지 않게.
 */
const key = (userId: string) => `dinary.labelSeen.${userId}`;

/** rowsReady — 기록을 다 읽은 뒤에만(빈 목록으로 「처음」을 적지 않게). */
export function useSeenLabels(userId: string | null | undefined, earnedIds: string[], rowsReady: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["label-seen", userId],
    enabled: !!userId && rowsReady,
    staleTime: Infinity,
    queryFn: async (): Promise<string[] | null> => {
      const raw = await AsyncStorage.getItem(key(userId!)).catch(() => null);
      return raw ? (JSON.parse(raw) as string[]) : null;
    },
  });
  // 처음이면 지금 받은 것을 본 것으로 적어 둡니다.
  const first = q.isSuccess && q.data === null;
  const earnedKey = earnedIds.join(",");
  useEffect(() => {
    if (!first || !userId) return;
    qc.setQueryData(["label-seen", userId], earnedIds);
    void AsyncStorage.setItem(key(userId), JSON.stringify(earnedIds)).catch(() => {});
  }, [first, userId, earnedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = new Set(q.data ?? earnedIds);
  const markSeen = useCallback((ids: string[]) => {
    if (!userId) return;
    const prev = qc.getQueryData<string[] | null>(["label-seen", userId]) ?? [];
    const next = [...new Set([...prev, ...ids])];
    qc.setQueryData(["label-seen", userId], next);
    void AsyncStorage.setItem(key(userId), JSON.stringify(next)).catch(() => {});
  }, [qc, userId]);
  return { isNew: (id: string) => q.isSuccess && !seen.has(id), markSeen, ready: q.isSuccess };
}

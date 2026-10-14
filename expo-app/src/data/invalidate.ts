import type { QueryClient } from "@tanstack/react-query";

/** 웹의 router.refresh() 대응 — 기록·위시·계정·캐릭터를 다시 읽습니다. */
export const refreshAll = (qc: QueryClient) =>
  Promise.all(["restaurants", "wishes", "account", "characters"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

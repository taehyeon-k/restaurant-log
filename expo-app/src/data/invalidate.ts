import type { QueryClient } from "@tanstack/react-query";

/** 웹의 router.refresh() 대응 — 기록·위시·계정을 다시 읽습니다. */
export const refreshAll = (qc: QueryClient) =>
  Promise.all(["restaurants", "wishes", "account"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

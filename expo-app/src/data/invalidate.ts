import type { QueryClient } from "@tanstack/react-query";

/** 웹의 router.refresh() 대응 — 기록·위시·계정·캐릭터·기록장(한 줄·기념일 식사 포함)을 다시 읽습니다. */
export const refreshAll = (qc: QueryClient) =>
  Promise.all(
    ["restaurants", "wishes", "account", "characters", "books", "record_notes", "anniversary_picks"].map((k) =>
      qc.invalidateQueries({ queryKey: [k] })
    )
  );

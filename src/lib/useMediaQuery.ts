"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// 하이드레이션 직후, 화면을 칠하기 전에 답을 냅니다 — 깜빡임 없이 한쪽만 그립니다.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 첫 렌더에서는 null 을 돌려줍니다 — 서버에서는 화면 크기를 알 수 없으니
 * 한쪽을 미리 그렸다가 지도 인스턴스가 두 번 생기는 일을 막기 위해서입니다.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

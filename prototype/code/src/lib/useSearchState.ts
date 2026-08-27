"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * All search state lives in the URL, so results are shareable and the page
 * stays a server component:
 *   /?kind=restaurant&q=냉면&category=한식&region=중구&keyword=가성비&sort=rating&id=12
 */
export function useSearchState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const commit = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "id") next.delete("id");
      commit(next);
    },
    [params, commit]
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      const current = next.getAll(key);
      next.delete(key);
      const after = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      after.forEach((v) => next.append(key, v));
      next.delete("id");
      commit(next);
    },
    [params, commit]
  );

  const switchKind = useCallback(
    (kind: string) => commit(new URLSearchParams({ kind })),
    [commit]
  );

  const reset = useCallback(() => {
    const kind = params.get("kind") ?? "restaurant";
    commit(new URLSearchParams({ kind }));
  }, [params, commit]);

  return {
    params,
    has: (key: string, value: string) => params.getAll(key).includes(value),
    set,
    toggle,
    switchKind,
    reset,
  };
}

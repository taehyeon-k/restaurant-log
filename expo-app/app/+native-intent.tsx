import { getShareExtensionKey } from "expo-share-intent";

/**
 * 공유 시트로 들어오면 앱이 `dinary://dataUrl=<key>` 로 열립니다 — 그런 경로는 없으니 홈으로 돌리고,
 * 실제 링크는 _layout 의 useShareIntent 가 받아 wish/link 로 보냅니다.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return "/";
    return path;
  } catch {
    return "/";
  }
}

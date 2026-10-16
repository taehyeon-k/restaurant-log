import type { Restaurant } from "@/lib/types";

/** 그 기록에 달린 사진들. 예전 기록은 photo_url 한 칸만 있습니다. */
export const photosOf = (r: Restaurant): string[] =>
  r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [];

export const photoCount = (r: Restaurant) => photosOf(r).length;

/**
 * 인증 사진(셔터로 찍은 한 장). 인증 기록은 첫 장이 인증 사진이고 앨범 사진은 그 뒤에 붙습니다.
 * 인증 사진은 지울 수 없고 순서도 바뀌지 않아 첫 장이 늘 그 사진입니다.
 */
export const verifiedShotOf = (r: Restaurant): string | null => (r.verified ? (photosOf(r)[0] ?? null) : null);

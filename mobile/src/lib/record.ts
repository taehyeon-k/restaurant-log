import type { Restaurant } from "@/lib/types";

/** 그 기록에 달린 사진들. 예전 기록은 photo_url 한 칸만 있습니다. */
export const photosOf = (r: Restaurant): string[] =>
  r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [];

export const photoCount = (r: Restaurant) => photosOf(r).length;

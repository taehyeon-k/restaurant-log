import { feltLabel, feltLevel } from "@/lib/price";
import type { Restaurant } from "@/lib/types";

export type ShareOptions = { rate: boolean; memo: boolean };

/**
 * 기록 한 건을 남에게 보낼 글로 만듭니다. 시트 미리보기와 실제로 보내는 글이 모두 여기서 나옵니다.
 * 방문 날짜·인증 시각은 넣지 않습니다.
 */
export function buildShareText(r: Restaurant, opt: ShareOptions): string {
  const blocks: string[][] = [];

  const head = [r.category ? `${r.name} · ${r.category}` : r.name];
  const where = r.address ?? r.region;
  if (where) head.push(where);
  blocks.push(head);

  const menus = r.menus
    .filter((m) => m.name.trim())
    .map((m) => `${m.vote === 1 ? "👍 " : m.vote === -1 ? "👎 " : ""}${m.name.trim()}`);
  if (menus.length) blocks.push(["먹은 것", ...menus]);
  else if (r.menu?.trim()) blocks.push(["먹은 것", r.menu.trim()]);

  if (opt.rate) {
    const level = feltLevel(r);
    const parts = [
      r.rating != null ? `별점 ${r.rating} / 5` : null,
      level ? `체감 가격 돼지 ${level}/5 (${feltLabel(level)})` : null,
    ].filter(Boolean);
    if (parts.length) blocks.push([parts.join(" · ")]);
    if (opt.memo && r.review?.trim()) blocks.push([r.review.trim()]);
  }

  const query = [r.name, r.address].filter(Boolean).join(" ");
  blocks.push([`지도 https://map.naver.com/p/search/${encodeURIComponent(query)}`, "DINARY에서 보냄"]);

  return blocks.map((b) => b.join("\n")).join("\n\n");
}

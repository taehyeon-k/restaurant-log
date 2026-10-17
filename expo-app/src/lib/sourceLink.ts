export type SourceKind = "shorts" | "youtube" | "reels" | "instagram" | "tiktok" | "link";

export const SOURCE_KINDS: SourceKind[] = ["shorts", "youtube", "reels", "instagram", "tiktok", "link"];

export const SOURCE_LABEL: Record<SourceKind, string> = {
  shorts: "쇼츠", youtube: "유튜브", reels: "릴스", instagram: "인스타", tiktok: "틱톡", link: "링크",
};

/** 링크 카드 머리글 — 「YOUTUBE 쇼츠」 · 「INSTAGRAM 릴스」 … */
export const SOURCE_HEAD: Record<SourceKind, string> = {
  shorts: "YOUTUBE 쇼츠", youtube: "YOUTUBE", reels: "INSTAGRAM 릴스", instagram: "INSTAGRAM", tiktok: "TIKTOK", link: "LINK",
};

export const isSourceKind = (v: unknown): v is SourceKind => typeof v === "string" && (SOURCE_KINDS as string[]).includes(v);

/** 유튜브 계열은 ▶, 그 밖은 출처 글자 첫 자(인 · 틱 · 링). */
export const sourceGlyph = (kind: SourceKind | null | undefined) =>
  kind === "shorts" || kind === "youtube" || !kind ? "▶" : SOURCE_LABEL[kind][0];

const TRACKING = /^(si|igsh|igshid|feature|pp|fbclid|gclid|utm_.+)$/i;

function kindOf(u: URL): SourceKind {
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const path = u.pathname;
  if (host === "youtube.com" || host === "music.youtube.com") return path.startsWith("/shorts/") ? "shorts" : "youtube";
  if (host === "youtu.be") return "youtube";
  if (host === "instagram.com") return /^\/reels?\//.test(path) ? "reels" : "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  return "link";
}

/** 텍스트에서 첫 URL 을 찾아 종류를 붙입니다. URL 이 없으면 null. 추적용 쿼리(?si=, ?igsh=, utm_*)는 지웁니다. */
export function parseSourceLink(text: string): { url: string; kind: SourceKind } | null {
  const raw = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  const url = u.toString().replace(/\?$/, "");
  return { url, kind: kindOf(u) };
}

/** 짧은 주소 — 호스트 + 첫 경로 + 「…」. 「instagram.com/reel/…」 */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const first = u.pathname.split("/").filter(Boolean)[0];
    return first ? `${host}/${first}/…` : host;
  } catch {
    return url;
  }
}

/** 유튜브만 — oEmbed 로 제목·채널을 받습니다. 키 없음. 실패하면 null. */
export async function fetchYoutubeTitle(url: string, signal?: AbortSignal): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return j.title ? { title: j.title, author: j.author_name ?? "" } : null;
  } catch {
    return null;
  }
}

const FOOD = [
  "국밥", "냉면", "칼국수", "짬뽕", "짜장", "탕수육", "돈까스", "돈카츠", "라멘", "우동", "소바", "스시", "초밥", "오마카세",
  "파스타", "피자", "버거", "햄버거", "스테이크", "삼겹살", "갈비", "곱창", "막창", "족발", "보쌈", "치킨", "닭갈비", "떡볶이",
  "김밥", "순대", "만두", "쌀국수", "마라탕", "훠궈", "카레", "덮밥", "백반", "한정식", "횟집", "해장국", "감자탕",
  "부대찌개", "김치찌개", "곰탕", "설렁탕", "수제비", "베이글", "빵", "베이커리", "케이크", "디저트", "카페", "커피", "와인", "이자카야",
];

/** 제목에서 검색어를 뽑습니다 — 지명(…동·…구·…역)과 음식 단어를 우선, 없으면 제목 앞 20자. */
export function queryFromTitle(title: string): string {
  const clean = title.replace(/#\S+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  const place = words.find((w) => /^[가-힣]{1,6}(동|구|역|로|길)$/.test(w) && w.length >= 2);
  const food = FOOD.find((f) => clean.includes(f));
  const picked = [place, food].filter(Boolean).join(" ");
  return picked || clean.slice(0, 20).trim();
}

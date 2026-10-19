import { supabase } from "./supabase";

export type SourceKind = "shorts" | "youtube" | "reels" | "instagram" | "tiktok" | "blog" | "link";

export const SOURCE_KINDS: SourceKind[] = ["shorts", "youtube", "reels", "instagram", "tiktok", "blog", "link"];

export const SOURCE_LABEL: Record<SourceKind, string> = {
  shorts: "쇼츠", youtube: "유튜브", reels: "릴스", instagram: "인스타 게시물", tiktok: "틱톡", blog: "블로그", link: "링크",
};

/** 링크 카드 머리글 — 「YOUTUBE 쇼츠」 · 「INSTAGRAM 릴스」 … 블로그는 호스트별로 headOf 가 고릅니다. */
export const SOURCE_HEAD: Record<SourceKind, string> = {
  shorts: "YOUTUBE 쇼츠", youtube: "YOUTUBE", reels: "INSTAGRAM 릴스", instagram: "INSTAGRAM 게시물", tiktok: "TIKTOK", blog: "BLOG", link: "LINK",
};

export const isSourceKind = (v: unknown): v is SourceKind => typeof v === "string" && (SOURCE_KINDS as string[]).includes(v);

/** 「OO에서 보기」 · 「OO에서 담음」에 쓰는 짧은 이름 — 인스타 게시물만 「인스타」로 줄입니다. */
export const sourceShort = (kind: SourceKind) => (kind === "instagram" ? "인스타" : SOURCE_LABEL[kind]);

/** 영상(유튜브 · 릴스 · 틱톡)은 ▶, 블로그 · 인스타 게시물 · 링크는 문서 아이콘(SourceIcon). */
export const sourceIcon = (kind: SourceKind | null | undefined): "play" | "doc" =>
  !kind || kind === "shorts" || kind === "youtube" || kind === "reels" || kind === "tiktok" ? "play" : "doc";

const BLOG_HEAD = (host: string) =>
  host.endsWith("naver.com") || host === "naver.me" ? "NAVER 블로그" : host.endsWith("tistory.com") ? "TISTORY" : host === "brunch.co.kr" ? "BRUNCH" : "BLOG";

/** 링크 카드 머리글 — 블로그는 「NAVER 블로그」 · 「TISTORY」 · 「BRUNCH」. */
export function headOf(url: string, kind: SourceKind): string {
  if (kind !== "blog") return SOURCE_HEAD[kind];
  try { return BLOG_HEAD(new URL(url).hostname.replace(/^(www\.|m\.)/, "")); } catch { return SOURCE_HEAD.blog; }
}

const TRACKING = /^(si|igsh|igshid|feature|pp|fbclid|gclid|utm_.+)$/i;

function kindOf(u: URL): SourceKind {
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const path = u.pathname;
  if (host === "youtube.com" || host === "music.youtube.com") return path.startsWith("/shorts/") ? "shorts" : "youtube";
  if (host === "youtu.be") return "youtube";
  if (host === "instagram.com") return /^\/reels?\//.test(path) ? "reels" : "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "blog.naver.com" || host === "naver.me" || host.endsWith(".tistory.com") || host === "brunch.co.kr") return "blog";
  return "link";
}

/** 위시 폼의 「링크」가 받는 종류 — 지금은 모두 받습니다(블로그 · 그 밖의 링크까지). */
export const isAcceptedKind = (k: SourceKind) => isSourceKind(k);

/**
 * 텍스트에서 첫 URL 을 찾아 종류를 붙입니다. URL 이 없으면 null. 추적용 쿼리(?si=, ?igsh=, utm_*)는 지웁니다.
 * 공유 문구에 섞인 링크(「이 영상 봐 https://youtu.be/…」)와 http 없이 복사된 유튜브 · 인스타 주소도 받습니다.
 */
export function parseSourceLink(text: string): { url: string; kind: SourceKind } | null {
  let raw = text.match(/https?:\/\/[^\s<>"']+|(?:(?:www|m)\.)?(?:youtube\.com|youtu\.be|instagram\.com)\/[^\s<>"']+/i)?.[0];
  if (!raw) return null;
  if (!/^https?:/i.test(raw)) raw = "https://" + raw;
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

/** 출처 띠 — 「블로그에서 담음 · {제목 앞 16자…} · {작성자}」, 제목이 없으면 짧은 주소. 위시 폼 · 그룹 화면이 같이 씁니다. */
export function sourceStrip(src: { url: string; kind: SourceKind; title?: string | null; author?: string | null }) {
  const title = src.title ? (src.title.length > 16 ? `${src.title.slice(0, 16)}…` : src.title) : null;
  return [`${sourceShort(src.kind)}에서 담음`, ...(title ? [title, src.author] : [shortUrl(src.url)])].filter(Boolean).join(" · ");
}

export type LinkMeta = { title: string; author: string; finalUrl?: string | null };

/**
 * 원 게시물의 제목 · 작성자 — 유튜브는 oEmbed(앱에서 바로), 블로그 · 링크는 Edge Function link-meta.
 * 인스타 · 틱톡은 가져오지 않습니다(HANDOFF-wish-group §4). 실패하면 null — 화면은 짧은 주소로 대신 보여 줍니다.
 */
export async function fetchLinkMeta(url: string, kind: SourceKind, signal?: AbortSignal): Promise<LinkMeta | null> {
  if (kind === "shorts" || kind === "youtube") return fetchYoutubeTitle(url, signal);
  if (kind !== "blog" && kind !== "link") return null;
  try {
    const { data, error } = await supabase.functions.invoke<{ title: string | null; author: string | null; finalUrl: string | null }>("link-meta", { body: { url } });
    if (signal?.aborted || error || !data?.title) return null;
    return { title: data.title, author: data.author ?? "", finalUrl: data.finalUrl };
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

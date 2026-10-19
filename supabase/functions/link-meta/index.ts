/**
 * link-meta — 위시 「링크」로 받은 블로그 · 그 밖의 링크의 제목 · 작성자(HANDOFF-wish-group §4).
 *
 *   POST /functions/v1/link-meta { url } → { title, author, finalUrl }  (못 찾으면 각 null)
 *
 * 로그인한 사용자만. 유튜브 · 인스타 · 틱톡은 받지 않습니다(유튜브는 앱이 oEmbed 로 바로, 인스타 · 틱톡은 가져오지 않음).
 * 메타 태그만 읽고 본문은 읽지 않습니다 — 앞 200KB, 4초. 같은 주소는 하루 캐시(link_meta_cache).
 * 네이버 블로그는 PC 주소가 iframe 이라 m.blog.naver.com/{blogId}/{logNo} 로 바꿔 엽니다. naver.me 는 리다이렉트를 따라갑니다.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIMEOUT_MS = 4000;
const MAX_BYTES = 200_000;
const MAX_REDIRECTS = 4;
const CACHE_MS = 24 * 3600_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

type Meta = { title: string | null; author: string | null; finalUrl: string | null };

const BLOCKED = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)$/i;

/** 열어도 되는 주소인지 — https 만, 사설 · 내부 주소는 막습니다. 블로그 호스트는 http 도 https 로. */
function allowed(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase();
  if (BLOCKED.test(host)) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return null;
  // IP 로 적은 주소는 받지 않습니다(사설망 · 메타데이터 주소 막기).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) return null;
  return u;
}

/** 네이버 블로그 PC 주소 → 모바일 주소(메타가 바로 있음). */
function naverMobile(u: URL): URL {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "blog.naver.com" && host !== "m.blog.naver.com") return u;
  const blogId = u.searchParams.get("blogId");
  const logNo = u.searchParams.get("logNo");
  if (blogId && logNo) return new URL(`https://m.blog.naver.com/${blogId}/${logNo}`);
  const [id, no] = u.pathname.split("/").filter(Boolean);
  if (id && no && /^\d+$/.test(no)) return new URL(`https://m.blog.naver.com/${id}/${no}`);
  return host === "m.blog.naver.com" ? u : new URL(`https://m.blog.naver.com${u.pathname}${u.search}`);
}

const naverBlogId = (u: URL) => {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "blog.naver.com" && host !== "m.blog.naver.com") return null;
  return u.searchParams.get("blogId") ?? u.pathname.split("/").filter(Boolean)[0] ?? null;
};

/** 앞 MAX_BYTES 만 읽습니다. */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) { const n = Math.min(c.length, buf.length - at); buf.set(c.subarray(0, n), at); at += n; if (at >= buf.length) break; }
  return new TextDecoder("utf-8").decode(buf);
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();

/** <meta property|name="key" content="…"> — 속성 순서가 바뀌어도 받습니다. */
function meta(html: string, key: string): string | null {
  const k = key.replace(/[.:]/g, (c) => `\\${c}`);
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = a ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
  const v = b?.[1] ? decode(b[1]) : "";
  return v || null;
}

async function fetchMeta(start: URL): Promise<Meta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let u = naverMobile(start);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(u, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) DinaryLinkMeta/1.0", Accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        res.body?.cancel().catch(() => {});
        const next = loc ? allowed(new URL(loc, u).toString()) : null;
        if (!next) return { title: null, author: null, finalUrl: u.toString() };
        u = naverMobile(next);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
        res.body?.cancel().catch(() => {});
        return { title: null, author: null, finalUrl: u.toString() };
      }
      const html = await readHead(res);
      const title = meta(html, "og:title") ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null);
      const author =
        meta(html, "og:article:author") ?? meta(html, "naverblog:nickname") ?? meta(html, "author") ?? meta(html, "article:author") ??
        meta(html, "og:site_name") ?? naverBlogId(u);
      return { title, author: author && !/^https?:/i.test(author) ? author : naverBlogId(u), finalUrl: u.toString() };
    }
    return { title: null, author: null, finalUrl: u.toString() };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 만 받습니다" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const db = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "로그인이 필요합니다" }, 401);

  const body = await req.json().catch(() => null) as { url?: unknown } | null;
  const target = typeof body?.url === "string" ? allowed(body.url.trim()) : null;
  if (!target) return json({ title: null, author: null, finalUrl: null }, 400);
  const key = target.toString();

  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data: hit } = await admin.from("link_meta_cache").select("title, author, final_url, fetched_at").eq("url", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_MS) {
    return json({ title: hit.title, author: hit.author, finalUrl: hit.final_url });
  }

  let m: Meta;
  try { m = await fetchMeta(target); } catch { m = { title: null, author: null, finalUrl: null }; }
  // 못 찾은 것은 남기지 않습니다 — 잠깐 막혔던 거면 다음에 다시 찾게.
  if (m.title) await admin.from("link_meta_cache").upsert({ url: key, title: m.title, author: m.author, final_url: m.finalUrl, fetched_at: new Date().toISOString() });
  return json(m);
});

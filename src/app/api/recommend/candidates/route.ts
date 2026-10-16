import { NextResponse } from "next/server";

/**
 * 「지금 뭐 먹지」 후보 — 앱(expo-app/src/lib/rec)이 부릅니다. 카카오 키는 서버에만 둡니다.
 * 받는 것은 기준 좌표와 반경뿐이고(개인 기록 · 위시는 보내지 않습니다), 좌표는 이 요청에만 쓰고 남기지 않습니다.
 *
 * 카카오 카테고리 검색은 한 질의에 최대 45곳(15 × 3쪽)이라 거리순만 받으면 번화가에서 바로 옆 몇 건물로 치우칩니다.
 * 그래서 (1) 원 안 거리순 3쪽 + (2) 반경을 덮는 3×3 사각형 칸마다 2쪽을 받아 합칩니다. 쪽은 is_end 이면 더 묻지 않습니다.
 * 같은 칸(약 100m) · 같은 반경의 온전한 결과는 10분 동안 메모리에 둡니다 — 짧은 성능 캐시이며 DB 에 저장하지 않습니다.
 * 일부 질의가 실패하면 partial = true 로 받은 것만 돌려줍니다. 모두 실패하면 502.
 */
const KEY = process.env.KAKAO_REST_API_KEY?.trim();
const URL_CATEGORY = "https://dapi.kakao.com/v2/local/search/category.json";
const RADII = [1500, 3000];
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;

type Doc = {
  id: string; place_name: string; category_name: string; road_address_name: string; address_name: string;
  place_url: string; x: string; y: string;
};
type Page = { documents?: Doc[]; meta?: { is_end?: boolean } };
type Candidate = { id: string; name: string; category_name: string; address: string | null; lat: number; lng: number; place_url: string | null };

const cache = new Map<string, { at: number; body: { candidates: Candidate[]; radius: number; partial: boolean } }>();

async function page(params: Record<string, string>): Promise<Page> {
  const res = await fetch(`${URL_CATEGORY}?${new URLSearchParams({ category_group_code: "FD6", size: "15", ...params })}`, {
    headers: { Authorization: `KakaoAK ${KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return res.json();
}

/** 한 칸의 쪽들을 차례로 — 끝이면 멈춥니다. */
async function pages(params: Record<string, string>, max: number) {
  const out: Doc[] = [];
  for (let p = 1; p <= max; p++) {
    const json = await page({ ...params, page: String(p) });
    out.push(...(json.documents ?? []));
    if (json.meta?.is_end !== false) break;
  }
  return out;
}

const meters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = rad(bLng - aLng) * Math.cos(rad((aLat + bLat) / 2));
  return Math.sqrt(rad(bLat - aLat) ** 2 + x ** 2) * 6371000;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Number(sp.get("radius") ?? "1500");
  if (!sp.get("lat") || !sp.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !RADII.includes(radius)) {
    return NextResponse.json({ error: "invalid lat/lng/radius" }, { status: 400 });
  }
  if (!KEY) return NextResponse.json({ error: "KAKAO_REST_API_KEY 가 설정되지 않았습니다" }, { status: 503 });

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);

  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const jobs: Promise<Doc[]>[] = [pages({ x: String(lng), y: String(lat), radius: String(radius), sort: "distance" }, 3)];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const s = lat - dLat + (2 * dLat * i) / 3, n = lat - dLat + (2 * dLat * (i + 1)) / 3;
      const w = lng - dLng + (2 * dLng * j) / 3, e = lng - dLng + (2 * dLng * (j + 1)) / 3;
      jobs.push(pages({ rect: `${w},${s},${e},${n}` }, 2));
    }
  }
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((r): r is PromiseFulfilledResult<Doc[]> => r.status === "fulfilled");
  if (!ok.length) return NextResponse.json({ error: "카카오 장소 검색에 실패했습니다" }, { status: 502 });

  const seen = new Map<string, Candidate>();
  for (const d of ok.flatMap((r) => r.value)) {
    if (!d.id || seen.has(d.id)) continue;
    const c = {
      id: d.id, name: d.place_name, category_name: d.category_name, address: d.road_address_name || d.address_name || null,
      lat: Number(d.y), lng: Number(d.x), place_url: d.place_url || null,
    };
    if (c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng) && meters(lat, lng, c.lat, c.lng) <= radius) seen.set(d.id, c);
  }
  const body = { candidates: [...seen.values()], radius, partial: ok.length < settled.length };
  if (!body.partial) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { at: Date.now(), body });
  }
  return NextResponse.json(body);
}

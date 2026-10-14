/**
 * places-at — 지도에서 길게 누른 자리의 건물 안 식당·카페(층별), 못 찾으면 둘레 목록.
 *
 *   GET /functions/v1/places-at?lat=&lng=            → building | radius(50m)
 *   GET /functions/v1/places-at?lat=&lng=&radius=25  → radius 만(앱의 반경 칩)
 *
 * 앱은 서울 리전으로 부릅니다(x-region: ap-northeast-2) — 카카오·juso·VWorld 가 가깝고, VWorld 는 국외 IP 를 막습니다.
 * DB(시드니)는 places_at_lookup 한 번으로 다녀옵니다.
 *
 * 환경변수(Edge Function secrets): KAKAO_REST_API_KEY, JUSO_API_KEY, VWORLD_API_KEY
 *   (SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 넣어 줍니다)
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const KAKAO = Deno.env.get("KAKAO_REST_API_KEY") ?? "";
const JUSO = Deno.env.get("JUSO_API_KEY") ?? "";
const VWORLD = Deno.env.get("VWORLD_API_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** 전체 예산 — 넘으면 둘레 목록으로. 외부 호출 하나는 800ms. */
const TOTAL_MS = 2000;
const BUILDING_BUDGET_MS = 1300;
const CALL_MS = 800;
const RADII = [25, 50, 100] as const;
type Radius = (typeof RADII)[number];

type Place = {
  id: string; name: string; category: string; kakaoId?: string; myRecordCount: number; isWish: boolean;
  /** 앱이 기록 추가 흐름에 넘길 값들 */
  kind: "restaurant" | "cafe"; appCategory: string | null; lat: number; lng: number; addr: string | null;
};
type PlacesAt =
  | { mode: "building"; building: { id: string; name: string; roadAddr: string; footprint: [number, number][] | null }; floors: { floor: string; places: Place[] }[]; ms?: number }
  | { mode: "radius"; addr: string; radius: Radius; places: (Place & { distanceM: number })[]; ms?: number };

type StoreRow = {
  store_id: string; name: string; branch: string | null; cat_mid: string | null; cat_small: string | null; floor: string | null;
  lat: number; lng: number; kakao_place_id: string | null; distance_m?: number; road_addr?: string | null;
};
type Mine = { id: number; name: string; lat: number; lng: number };
type Lookup = {
  building: { id: string; name: string | null; roadAddr: string | null; fresh: boolean; footprint: [number, number][] | null } | null;
  stores: StoreRow[]; near: StoreRow[] | null; mine: Mine[]; wishes: { name: string; lat: number; lng: number }[];
};
type KakaoPlace = { id: string; place_name: string; category_name: string; category_group_code: string; x: string; y: string; distance: string; road_address_name: string; address_name: string };

/* ── 도움 함수 ─────────────────────────────── */

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};

const later = (fn: () => Promise<unknown>) => {
  const p = fn().catch((e) => console.error("[places-at] background", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
};

async function getJson<T>(url: string, init: RequestInit = {}, ms = CALL_MS): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

const kakao = <T>(path: string, params: Record<string, string>) =>
  getJson<T>(`https://dapi.kakao.com/v2/local/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `KakaoAK ${KAKAO}` } });

/** 이름 비교 — 공백·기호·대소문자를 지웁니다. */
const norm = (s: string) => s.toLowerCase().replace(/[\s()\[\]·.,'"&\-_/]/g, "");

function meters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const x = r(bLng - aLng) * Math.cos(r((aLat + bLat) / 2));
  const y = r(bLat - aLat);
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** 같은 가게 이름인지 — 같거나, 한쪽이 다른 쪽으로 시작(「스타벅스」 ↔ 「스타벅스 강남R점」). */
function sameName(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && long.startsWith(short);
}

const displayName = (s: StoreRow) => (s.branch ? `${s.name} ${s.branch}` : s.name);

/** 공공 업종 → 앱 종류(CATEGORY_COLORS 의 이름)·맛집/카페. */
function appCategory(mid: string | null, small: string | null): { kind: Place["kind"]; cat: string | null } {
  const m = (mid ?? "").trim(), s = (small ?? "").trim();
  if (m.startsWith("비알코올")) return { kind: "cafe", cat: "커피" };
  if (s === "빵/도넛") return { kind: "cafe", cat: "베이커리" };
  if (s === "떡/한과" || s === "아이스크림/빙수") return { kind: "cafe", cat: "디저트" };
  if (m === "한식") return { kind: "restaurant", cat: "한식" };
  if (m === "중식") return { kind: "restaurant", cat: "중식" };
  if (m === "일식") return { kind: "restaurant", cat: "일식" };
  if (m === "서양식") return { kind: "restaurant", cat: "양식" };
  if (m === "동남아시아") return { kind: "restaurant", cat: "아시안" };
  if (["치킨", "피자", "버거", "토스트/샌드위치/샐러드"].includes(s)) return { kind: "restaurant", cat: "양식" };
  if (m === "기타 간이") return { kind: "restaurant", cat: "분식" };
  return { kind: "restaurant", cat: null };
}

/** 카카오 "음식점 > 한식 > 냉면" → 앱 종류 + 보여줄 업종(셋째 칸 — 넷째 칸부터는 「공차」 같은 상표라 쓰지 않습니다). */
function kakaoCategory(p: KakaoPlace): { kind: Place["kind"]; cat: string | null; label: string } {
  const parts = p.category_name.split(">").map((v) => v.trim());
  const label = parts[2] || parts[1] || parts[0] || "음식점";
  if (p.category_group_code === "CE7") {
    const sub = parts.slice(1).join(" ");
    const cat = /베이커리|제과|빵/.test(sub) ? "베이커리" : /디저트|아이스크림|떡/.test(sub) ? "디저트" : /차|티/.test(parts[2] ?? "") ? "차" : "커피";
    return { kind: "cafe", cat, label };
  }
  const known = ["한식", "중식", "일식", "양식", "아시안", "분식"];
  const hit = parts.slice(1).map((v) => known.find((k) => v.startsWith(k))).find(Boolean) ?? null;
  return { kind: "restaurant", cat: hit, label };
}

/** 층 정렬 키 — B2 < B1 < 1F < 2F …, 기타는 맨 뒤. */
const floorRank = (f: string) => {
  const b = f.match(/^B(\d+)$/);
  if (b) return -Number(b[1]);
  const n = f.match(/^(\d+)F$/);
  return n ? Number(n[1]) : 10_000;
};

/* ── 기록·위시 붙이기 ──────────────────────── */

function attach(base: { name: string; altNames: string[]; lat: number; lng: number }, look: Lookup) {
  const names = [base.name, ...base.altNames];
  const near = (x: { lat: number; lng: number }) => meters(x.lat, x.lng, base.lat, base.lng) <= 100;
  const myRecordCount = look.mine.filter((r) => near(r) && names.some((n) => sameName(n, r.name))).length;
  const isWish = look.wishes.some((w) => near(w) && names.some((n) => sameName(n, w.name)));
  return { myRecordCount, isWish };
}

function fromStore(s: StoreRow, look: Lookup, addr: string | null): Place {
  const { kind, cat } = appCategory(s.cat_mid, s.cat_small);
  return {
    id: `s:${s.store_id}`, name: displayName(s), category: (s.cat_small ?? s.cat_mid ?? "음식점").trim(),
    ...(s.kakao_place_id ? { kakaoId: s.kakao_place_id } : {}),
    ...attach({ name: displayName(s), altNames: [s.name], lat: s.lat, lng: s.lng }, look),
    kind, appCategory: cat, lat: s.lat, lng: s.lng, addr: s.road_addr ?? addr,
  };
}

/* ── 외부 조회 ─────────────────────────────── */

type Resolved = { bld: string; name: string; roadAddr: string };

/** 좌표 → (카카오) 도로명주소 → (juso) 건물관리번호. 못 찾으면 null. */
async function resolveBuilding(lat: number, lng: number): Promise<Resolved | null> {
  type C2A = { documents: { road_address: null | { address_name: string; building_name: string; main_building_no: string; sub_building_no: string; underground_yn: string }; address: null | { address_name: string } }[] };
  const c2a = await kakao<C2A>("geo/coord2address.json", { x: String(lng), y: String(lat) });
  const doc = c2a.documents[0];
  if (!doc) return null;
  const road = doc.road_address;
  const keyword = road?.address_name ?? doc.address?.address_name;
  if (!keyword || !JUSO) return null;

  type Juso = { results: { common: { errorCode: string; totalCount: string }; juso: null | { bdMgtSn: string; bdNm: string; roadAddrPart1: string; buldMnnm: string; buldSlno: string; udrtYn: string }[] } };
  const res = await getJson<Juso>(`https://business.juso.go.kr/addrlink/addrLinkApi.do?${new URLSearchParams({
    confmKey: JUSO, keyword, currentPage: "1", countPerPage: "10", resultType: "json",
  })}`);
  const list = res.results.juso ?? [];
  if (res.results.common.errorCode !== "0" || !list.length) return null;

  let hit = list[0];
  if (road) {
    // 「강남대로 396」 검색은 「강남대로 지하396」 도 돌려줍니다 — 본번·부번·지하 여부까지 맞는 것을 고릅니다.
    const exact = list.find((j) =>
      j.buldMnnm === road.main_building_no && j.buldSlno === (road.sub_building_no || "0") && j.udrtYn === (road.underground_yn === "Y" ? "1" : "0"));
    if (exact) hit = exact;
    else if (list.length > 1) return null;
  } else if (list.length !== 1) {
    return null; // 지번만 있는 자리(도로·공원 등)는 한 건물로 좁혀질 때만.
  }
  return {
    bld: hit.bdMgtSn,
    name: road?.building_name || hit.bdNm || hit.roadAddrPart1.replace(/^\S+\s\S+\s/, ""),
    roadAddr: hit.roadAddrPart1,
  };
}

/**
 * VWorld 도로명주소건물(LT_C_SPBD) — 이 좌표를 품은 건물 바깥 고리. [lat, lng].
 * "none" = VWorld 는 답했는데 이 자리를 품은 건물이 없음(공원·광장 — 땅 전체가 주소 하나인 곳). null = 모름(키 없음·오류).
 */
async function fetchFootprint(lat: number, lng: number, bld: string): Promise<[number, number][] | "none" | null> {
  if (!VWORLD) return null;
  type Feature = { geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: Record<string, string> };
  type VW = { response: { status: string; result?: { featureCollection: { features: Feature[] } } } };
  const res = await getJson<VW>(`https://api.vworld.kr/req/data?${new URLSearchParams({
    service: "data", version: "2.0", request: "GetFeature", format: "json", errorformat: "json", size: "10",
    data: "LT_C_SPBD", geomFilter: `POINT(${lng} ${lat})`, geometry: "true", attribute: "true", crs: "EPSG:4326", key: VWORLD,
  })}`);
  const features = res.response.result?.featureCollection.features ?? [];
  if (res.response.status === "NOT_FOUND" || (res.response.status === "OK" && !features.length)) return "none";
  if (res.response.status !== "OK") return null;
  const f = features.find((x) => Object.values(x.properties).includes(bld)) ?? features[0];
  const polys = (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
  // 가장 큰 폴리곤의 바깥 고리
  const area = (ring: number[][]) => Math.abs(ring.reduce((s, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x1 * y2 - x2 * y1; }, 0));
  const outer = polys.map((p) => p[0]).sort((a, b) => area(b) - area(a))[0];
  if (!outer || outer.length < 4) return null;
  const ring = outer.map(([x, y]) => [Math.round(y * 1e7) / 1e7, Math.round(x * 1e7) / 1e7] as [number, number]);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first); // 닫힌 고리여야 POLYGON 으로 저장됩니다
  return ring;
}

async function kakaoNearby(lat: number, lng: number, radius: number): Promise<KakaoPlace[]> {
  type Res = { documents: KakaoPlace[]; meta: { is_end: boolean } };
  const one = (code: string, page: number) =>
    kakao<Res>("search/category.json", { category_group_code: code, x: String(lng), y: String(lat), radius: String(radius), sort: "distance", page: String(page), size: "15" })
      .catch(() => ({ documents: [], meta: { is_end: true } }) as Res);
  const pages = radius >= 50 ? [1, 2, 3] : [1, 2];
  const all = await Promise.all(["FD6", "CE7"].flatMap((code) => pages.map((p) => one(code, p))));
  const seen = new Map<string, KakaoPlace>();
  for (const r of all) for (const d of r.documents) seen.set(d.id, d);
  return [...seen.values()];
}

/** 공공 상가 ↔ 카카오 — 이름이 비슷하고 30m 안. */
function matchKakao(s: StoreRow, kakaoList: KakaoPlace[]): KakaoPlace | null {
  let best: KakaoPlace | null = null, bestD = Infinity;
  for (const k of kakaoList) {
    if (!sameName(k.place_name, displayName(s)) && !sameName(k.place_name, s.name)) continue;
    const d = meters(Number(k.y), Number(k.x), s.lat, s.lng);
    if (d <= 30 && d < bestD) { best = k; bestD = d; }
  }
  return best;
}

/** 링크 저장(백그라운드). */
function saveLinks(admin: SupabaseClient, pairs: { store_id: string; kakao_place_id: string }[]) {
  if (!pairs.length) return;
  later(async () => {
    const { error } = await admin.from("place_links").upsert(pairs.map((p) => ({ ...p, matched_at: new Date().toISOString() })), { onConflict: "store_id" });
    if (error) throw error;
  });
}

/* ── 응답 만들기 ───────────────────────────── */

function buildingResponse(b: { id: string; name: string | null; roadAddr: string | null }, footprint: [number, number][] | null, look: Lookup): PlacesAt {
  const id = b.id;
  const roadAddr = b.roadAddr ?? "";
  const name = b.name || roadAddr.replace(/^\S+\s\S+\s/, "");
  const groups = new Map<string, Place[]>();
  for (const s of look.stores) {
    const f = s.floor ?? "기타";
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f)!.push(fromStore(s, look, roadAddr));
  }
  const floors = [...groups.entries()]
    .sort(([a], [b2]) => floorRank(a) - floorRank(b2))
    .map(([floor, places]) => ({ floor, places: places.sort((x, y) => y.myRecordCount - x.myRecordCount || Number(y.isWish) - Number(x.isWish)) }));
  return { mode: "building", building: { id, name, roadAddr, footprint }, floors };
}

async function radiusResponse(lat: number, lng: number, radius: Radius, look: Lookup, admin: SupabaseClient, addrHint: Promise<string>): Promise<PlacesAt> {
  const [kakaoList, addr] = await Promise.all([
    kakaoNearby(lat, lng, radius).catch(() => [] as KakaoPlace[]),
    addrHint.catch(() => ""),
  ]);
  const stores = (look.near ?? []).filter((s) => (s.distance_m ?? 0) <= radius);
  const used = new Set<string>();
  const links: { store_id: string; kakao_place_id: string }[] = [];
  const out: (Place & { distanceM: number })[] = [];

  for (const s of stores) {
    const k = (s.kakao_place_id && kakaoList.find((x) => x.id === s.kakao_place_id)) || matchKakao(s, kakaoList);
    if (k && !used.has(k.id)) {
      used.add(k.id);
      if (!s.kakao_place_id) links.push({ store_id: s.store_id, kakao_place_id: k.id });
    }
    out.push({ ...fromStore(s, look, null), ...(k ? { kakaoId: k.id } : {}), distanceM: Math.round(s.distance_m ?? 0) });
  }
  for (const k of kakaoList) {
    if (used.has(k.id)) continue;
    const kc = kakaoCategory(k);
    const kLat = Number(k.y), kLng = Number(k.x);
    out.push({
      id: `k:${k.id}`, name: k.place_name, category: kc.label, kakaoId: k.id,
      ...attach({ name: k.place_name, altNames: [], lat: kLat, lng: kLng }, look),
      kind: kc.kind, appCategory: kc.cat, lat: kLat, lng: kLng, addr: k.road_address_name || k.address_name || null,
      distanceM: Math.round(Number(k.distance) || meters(lat, lng, kLat, kLng)),
    });
  }
  saveLinks(admin, links);
  out.sort((a, b) => a.distanceM - b.distanceM);
  return { mode: "radius", addr, radius, places: out.slice(0, 40) };
}

/** 건물 모드에서 카카오 id 가 없는 가게를 뒤에서 매칭해 둡니다(다음 응답부터 kakaoId). */
function linkBuildingLater(lat: number, lng: number, look: Lookup, admin: SupabaseClient) {
  const missing = look.stores.filter((s) => !s.kakao_place_id);
  if (!missing.length || !KAKAO) return;
  later(async () => {
    const list = await kakaoNearby(lat, lng, 50);
    const pairs = missing.map((s) => ({ s, k: matchKakao(s, list) })).filter((x) => x.k).map((x) => ({ store_id: x.s.store_id, kakao_place_id: x.k!.id }));
    const seen = new Set<string>();
    saveLinks(admin, pairs.filter((p) => !seen.has(p.kakao_place_id) && seen.add(p.kakao_place_id)));
  });
}

/* ── 본체 ──────────────────────────────────── */

/** 같은 인스턴스 안의 좌표(≈11m) → 건물 기억. 카카오·juso 왕복을 건너뜁니다. */
const resolvedCache = new Map<string, { at: number; value: Resolved | null }>();
const RESOLVED_TTL = 24 * 3600_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const t0 = performance.now();
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radiusParam = Number(url.searchParams.get("radius"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "lat·lng 가 필요합니다" }, 400);
  if (!KAKAO) return json({ error: "KAKAO_REST_API_KEY 가 없습니다" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const db = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const lookup = async (args: { bld?: string | null; radius_m?: number | null; only_near?: boolean }) => {
    const { data, error } = await db.rpc("places_at_lookup", { lat, lng, bld: args.bld ?? null, radius_m: args.radius_m ?? null, only_near: args.only_near ?? false });
    if (error) throw new Error(`lookup: ${error.message}`);
    return data as Lookup;
  };
  /** 반경 머리에 쓸 짧은 주소 — 카카오 coord2address. */
  const addrOf = async () => {
    type C2A = { documents: { road_address: null | { address_name: string }; address: null | { address_name: string } }[] };
    const d = (await kakao<C2A>("geo/coord2address.json", { x: String(lng), y: String(lat) })).documents[0];
    return (d?.road_address?.address_name ?? d?.address?.address_name ?? "").replace(/^\S+\s/, "");
  };
  const done = (body: PlacesAt, tag: string) => {
    const ms = Math.round(performance.now() - t0);
    console.log(`[places-at] ${tag} ${ms}ms`);
    return json({ ...body, ms }, 200, { "Server-Timing": `total;desc="${tag}";dur=${ms}` });
  };
  const radiusFallback = async (radius: Radius, tag: string) => {
    const left = Math.max(400, TOTAL_MS - (performance.now() - t0));
    const look = await Promise.race([
      lookup({ radius_m: radius, only_near: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("lookup timeout")), left)),
    ]);
    return done(await radiusResponse(lat, lng, radius, look, admin, addrOf()), tag);
  };

  try {
    // 반경 칩(25/50/100)으로 다시 부른 것 — 건물은 건너뜁니다.
    if (RADII.includes(radiusParam as Radius)) return await radiusFallback(radiusParam as Radius, "radius-chip");

    const building = (async (): Promise<Response | null> => {
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      const mem = resolvedCache.get(key);
      // 1) 받아 둔 건물 경계(24h) 안이면 DB 한 번으로 끝 — 같은 건물 재요청의 빠른 길. 동시에 카카오→juso 도 출발.
      const cached = lookup({});
      const resolving = mem && Date.now() - mem.at < RESOLVED_TTL ? Promise.resolve(mem.value) : resolveBuilding(lat, lng).then((v) => {
        resolvedCache.set(key, { at: Date.now(), value: v });
        if (resolvedCache.size > 5000) resolvedCache.delete(resolvedCache.keys().next().value!);
        return v;
      });
      const hit = await cached.catch(() => null);
      if (hit?.building?.fresh && hit.stores.length) {
        linkBuildingLater(lat, lng, hit, admin);
        return done(buildingResponse(hit.building, hit.building.footprint, hit), "building-cached");
      }

      // 2) 건물관리번호로 가게 + (없으면) 둘레 가게. 경계는 동시에 VWorld 로.
      const resolved = await resolving.catch((e) => { console.warn("[places-at] resolve", String(e)); return null; });
      if (!resolved) return null;
      const footprintP = fetchFootprint(lat, lng, resolved.bld).catch((e) => { console.warn("[places-at] vworld", String(e)); return null; });
      const look = await lookup({ bld: resolved.bld, radius_m: 50 });
      if (!look.stores.length) {
        return done(await radiusResponse(lat, lng, 50, look, admin, Promise.resolve(resolved.roadAddr.replace(/^\S+\s/, ""))), "radius-empty-building");
      }
      let footprint = look.building?.footprint ?? null;
      if (!look.building?.fresh || !footprint) {
        const got = await footprintP;
        // 주소는 있어도 누른 자리를 품은 건물이 없으면(공원·광장) 건물 목록이 아니라 둘레로.
        if (got === "none") return await radiusFallback(50, "radius-no-footprint");
        const fresh = got;
        footprint = fresh ?? footprint;
        later(async () => {
          // 경계를 못 받았으면 footprint 는 건드리지 않습니다(예전 경계를 null 로 덮지 않게).
          const { error } = await admin.from("buildings").upsert({
            bld_mgt_no: resolved.bld, name: resolved.name, road_addr: resolved.roadAddr,
            ...(fresh ? { footprint: `SRID=4326;POLYGON((${fresh.map(([y, x]) => `${x} ${y}`).join(",")}))` } : {}),
            fetched_at: new Date().toISOString(),
          }, { onConflict: "bld_mgt_no" });
          if (error) throw error;
        });
      }
      linkBuildingLater(lat, lng, look, admin);
      return done(buildingResponse({ id: resolved.bld, name: resolved.name, roadAddr: resolved.roadAddr }, footprint, look), "building");
    })();

    const res = await Promise.race([
      building.catch((e) => { console.warn("[places-at] building", String(e)); return null; }),
      new Promise<null>((r) => setTimeout(() => r(null), BUILDING_BUDGET_MS)),
    ]);
    return res ?? (await radiusFallback(50, "radius"));
  } catch (e) {
    console.error("[places-at]", e);
    return json({ error: "잠시 후 다시 시도해 주세요" }, 502);
  }
});

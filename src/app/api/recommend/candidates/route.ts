import { NextResponse } from "next/server";

/**
 * 후보 생성 전용 API — 개인 기록/위시는 보내지 않습니다.
 * 인증은 src/proxy.ts에서 검증하고 Kakao 키는 서버에만 둡니다.
 * Dinary의 기존 /api/geocode?near=1 (500m 방문 인증 후보)에는 영향이 없습니다.
 */
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY?.trim();
const URL = "https://dapi.kakao.com/v2/local/search/category.json";

type Document = {
  id: string; place_name: string; category_name: string;
  road_address_name: string; address_name: string; place_url: string;
  x: string; y: string; distance: string;
};
type KakaoResult = { documents?: Document[] };

function category(raw: string): string | null {
  const parts = raw.split(">").map((p) => p.trim());
  for (const p of parts.slice(1)) {
    if (/한식|국밥|찌개|백반/.test(p)) return "한식";
    if (/중식|중국/.test(p)) return "중식";
    if (/일식|일본|초밥|스시/.test(p)) return "일식";
    if (/양식|이탈리|스테이크|파스타|피자/.test(p)) return "양식";
    if (/아시아|아시안|베트남|태국|인도/.test(p)) return "아시안";
    if (/분식|김밥|떡볶이/.test(p)) return "분식";
  }
  return null; // 모르는 것은 사용자 취향 점수의 중립값으로 둡니다.
}

async function search(lat: number, lng: number, radius: number, sort: "distance" | "accuracy", page: number): Promise<Document[]> {
  const params = new URLSearchParams({
    category_group_code: "FD6", x: String(lng), y: String(lat),
    radius: String(radius), sort, page: String(page), size: "15",
  });
  const response = await fetch(`${URL}?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKO_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`Kakao category search failed: ${response.status}`);
  const data = await response.json() as KakaoResult;
  return data.documents ?? [];
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Number(sp.get("radius") ?? "1500");
  if (!sp.has("lat") || !sp.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      !Number.isInteger(radius) || radius < 300 || radius > 3000) {
    return NextResponse.json({ error: "Invalid location or radius" }, { status: 400 });
  }
  if (!KAKAO_KEY) return NextResponse.json({ error: "Kakao API is not configured" }, { status: 503 });

  try {
    // 거리순 후보만 뽑으면 번화가에서는 주변 1~2블록으로 치우칩니다.
    // 정확도순 결과를 섞어 후보의 공간적 범위와 다양성을 늘립니다.
    const batches = await Promise.all([
      search(lat, lng, radius, "distance", 1),
      search(lat, lng, radius, "distance", 2),
      search(lat, lng, radius, "accuracy", 1),
      search(lat, lng, radius, "accuracy", 2),
      search(lat, lng, radius, "accuracy", 3),
    ]);
    const unique = new Map<string, Document>();
    for (const d of batches.flat()) {
      if (d.id && !unique.has(d.id)) unique.set(d.id, d);
    }
    const candidates = [...unique.values()].map((d) => ({
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y),
      lng: Number(d.x),
      distanceM: Number(d.distance),
      category: category(d.category_name),
      detailCategory: d.category_name,
      // 장소 ID를 통해 안전한 정규 URL을 구성합니다.
      url: /^\d+$/.test(d.id) ? `https://place.map.kakao.com/${d.id}` : null,
    })).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
      Number.isFinite(p.distanceM) && p.distanceM <= radius);

    return NextResponse.json({ candidates, source: "kakao", radiusM: radius });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve nearby restaurants" }, { status: 502 });
  }
}

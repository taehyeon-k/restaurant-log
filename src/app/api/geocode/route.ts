import { NextResponse } from "next/server";

const RAW = process.env.KAKAO_REST_API_KEY;
const KEY = RAW?.trim();
const BASE = "https://dapi.kakao.com/v2/local";

type Place = {
  name: string;
  address: string;
  region: string | null;
  lat: number;
  lng: number;
};

type NearbyPlace = Place & { distance: number; category: string | null };

/** 카카오 카테고리 코드 — 음식점 / 카페 */
const GROUP = { restaurant: "FD6", cafe: "CE7" } as const;

/** "음식점 > 한식 > 냉면" → "한식". 앱이 쓰는 종류 이름으로 좁힙니다. */
const KNOWN = [
  "한식", "중식", "일식", "양식", "아시안", "분식",
  "커피", "디저트", "베이커리", "차",
];

const category = (name?: string) => {
  const parts = (name ?? "").split(">").map((s) => s.trim());
  for (const part of parts.slice(1)) {
    const hit = KNOWN.find((k) => part.startsWith(k));
    if (hit) return hit;
  }
  if (parts.some((p) => p.includes("카페") || p.includes("커피"))) return "커피";
  return null;
};

async function kakao(path: string, params: Record<string, string>) {
  const res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `KakaoAK ${KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`카카오 ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** "서울 마포구 동교로 46길" → "서울 마포구" (성남처럼 시 안에 구가 있으면 셋까지) */
const gu = (address?: string) => {
  const t = (address ?? "").split(" ").filter(Boolean);
  if (t.length < 2) return null;

  if (t.length >= 3 && /시$/.test(t[1]) && /구$/.test(t[2])) {
    return `${t[0]} ${t[1]} ${t[2]}`;
  }
  return `${t[0]} ${t[1]}`;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;



  if (!KEY) {
    return NextResponse.json(
      { error: "KAKAO_REST_API_KEY 가 설정되지 않았습니다" },
      { status: 500 }
    );
  }

  const lat = sp.get("lat");
  const lng = sp.get("lng");

  try {
    // 좌표 둘레의 음식점·카페 — 방문인증 후보 (좌표는 여기서만 쓰고 남기지 않습니다)
    if (lat && lng && sp.get("near")) {
      const kind = sp.get("kind") === "cafe" ? "cafe" : "restaurant";
      const json = await kakao("search/category.json", {
        category_group_code: GROUP[kind],
        x: lng,
        y: lat,
        radius: "500",
        sort: "distance",
        size: "10",
      });

      const places: NearbyPlace[] = (json?.documents ?? []).map(
        (d: Record<string, string>) => {
          const address = d.road_address_name || d.address_name;
          return {
            name: d.place_name,
            address,
            region: gu(address),
            category: category(d.category_name),
            lat: Number(d.y),
            lng: Number(d.x),
            distance: Number(d.distance) || 0,
          };
        }
      );

      return NextResponse.json({ places });
    }

    // 좌표 → 주소
    if (lat && lng) {
      const json = await kakao("geo/coord2address.json", { x: lng, y: lat });
      const doc = json?.documents?.[0];
      if (!doc) return NextResponse.json({ places: [] });

      const address =
        doc.road_address?.address_name ?? doc.address?.address_name ?? "";

      return NextResponse.json({
        places: [
          {
            name: doc.road_address?.building_name || "",
            address,
            region: gu(address),
            lat: Number(lat),
            lng: Number(lng),
          },
        ] satisfies Place[],
      });
    }

    // 주소·상호 검색
    const q = (sp.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ places: [] });

    const [byAddress, byKeyword] = await Promise.all([
      kakao("search/address.json", { query: q, size: "5" }),
      kakao("search/keyword.json", { query: q, size: "10", sort: "accuracy" }),
    ]);

    const places: Place[] = [];

    for (const d of byAddress?.documents ?? []) {
      const address = d.road_address?.address_name ?? d.address_name;
      places.push({
        name: d.road_address?.building_name || "",
        address,
        region: gu(address),
        lat: Number(d.y),
        lng: Number(d.x),
      });
    }

    for (const d of byKeyword?.documents ?? []) {
      const address = d.road_address_name || d.address_name;
      places.push({
        name: d.place_name,
        address,
        region: gu(d.road_address_name || d.address_name),
        lat: Number(d.y),
        lng: Number(d.x),
      });
    }

    const seen = new Set<string>();
    const unique = places.filter((p) => {
      const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ places: unique.slice(0, 8) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 502 }
    );
  }
}

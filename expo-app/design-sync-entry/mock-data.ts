// Claude Design 미리보기용 샘플 데이터 — 실제 사용자 데이터가 아니라 화면이 어떻게 보이는지 보여 주기 위한 가짜 기록입니다.
import type { AccountInfo } from "../src/data/profile";
import type { Restaurant, Wish } from "../src/lib/types";

/** 음식 사진 자리에 쓰는 가짜 사진 — 종류 색 바탕에 이모지 한 개. */
const photo = (emoji: string, from: string, to: string) =>
  "data:image/svg+xml;base64," +
  btoa(
    unescape(
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="360" font-size="220" text-anchor="middle">${emoji}</text></svg>`,
      ),
    ),
  );

const base: Restaurant = {
  id: 0, created_at: "2026-09-01T00:00:00Z", kind: "restaurant", name: "", category: null, region: null, address: null, rating: null,
  menu: null, menus: [], price_level: null, price_range: null, review: null, revisit: false, visited_at: null, keywords: [], lat: null,
  lng: null, photo_url: null, photo_urls: [], cover_index: 0, place_key: null, verified: false, acc: null, verified_at: null, pending: false,
  from_wish: null,
};

const rec = (r: Partial<Restaurant>): Restaurant => ({ ...base, ...r, place_key: r.place_key ?? (r.name as string), created_at: `${r.visited_at ?? "2026-09-01"}T11:00:00Z` });

export const sampleRows: Restaurant[] = [
  rec({
    id: 1, name: "을지면옥", category: "한식", region: "서울 중구", address: "서울 중구 을지로3가 230-1", rating: 4.5,
    menu: "물냉면", menus: [{ name: "물냉면", price: 13000 }, { name: "제육", price: 38000 }], price_range: 13000, price_level: 3,
    review: "육수가 슴슴한데 끝맛이 깊다. 제육이랑 같이 먹으면 딱.", revisit: true, visited_at: "2026-10-02", keywords: ["노포", "혼밥", "웨이팅"],
    lat: 37.5662, lng: 126.9921, photo_url: photo("🍜", "#e9c9a8", "#b4552d"), photo_urls: [photo("🍜", "#e9c9a8", "#b4552d"), photo("🥩", "#e3b99a", "#9a4a52")],
    verified: true, acc: 14, verified_at: "2026-10-02T04:12:00Z",
  }),
  rec({
    id: 2, kind: "cafe", name: "카페 레이어드", category: "디저트", region: "서울 종로구", address: "서울 종로구 수송동 146-1", rating: 4.0,
    menu: "바스크 치즈케이크", menus: [{ name: "바스크 치즈케이크", price: 7500 }, { name: "아인슈페너", price: 6500 }], price_range: 14000, price_level: 3,
    review: "케이크가 진하고 커피는 산미가 적다. 창가 자리가 좋다.", visited_at: "2026-09-28", keywords: ["분위기", "데이트"],
    lat: 37.5726, lng: 126.9803, photo_url: photo("🍰", "#f1d4de", "#b06a86"), photo_urls: [photo("🍰", "#f1d4de", "#b06a86")],
    verified: true, acc: 9, verified_at: "2026-09-28T06:40:00Z",
  }),
  rec({
    id: 3, name: "스시 마루", category: "일식", region: "서울 용산구", address: "서울 용산구 이태원동 34-5", rating: 5,
    menu: "런치 오마카세", menus: [{ name: "런치 오마카세", price: 62000 }], price_range: 62000, price_level: 5,
    review: "샤리가 따뜻하고 네타 온도가 좋았다. 기념일에 다시.", visited_at: "2026-09-21", keywords: ["기념일", "분위기"],
    lat: 37.5347, lng: 126.9945, photo_url: photo("🍣", "#d6e0e6", "#5f7a8a"), photo_urls: [photo("🍣", "#d6e0e6", "#5f7a8a")],
    verified: true, acc: 18, verified_at: "2026-09-21T03:05:00Z",
  }),
  rec({
    id: 4, name: "명동교자", category: "한식", region: "서울 중구", address: "서울 중구 명동10길 29", rating: 4.0,
    menu: "칼국수", menus: [{ name: "칼국수", price: 12000 }, { name: "만두", price: 12000 }], price_range: 12000, price_level: 2,
    review: "마늘 김치가 센 편. 점심 피크엔 줄이 길다.", revisit: true, visited_at: "2026-09-14", keywords: ["웨이팅", "가성비"],
    lat: 37.5636, lng: 126.9869, photo_url: photo("🥟", "#efe0b8", "#c07a2e"), photo_urls: [photo("🥟", "#efe0b8", "#c07a2e")],
    verified: true, acc: 11, verified_at: "2026-09-14T03:30:00Z",
  }),
  rec({
    id: 5, kind: "cafe", name: "블루보틀 광화문", category: "커피", region: "서울 종로구", address: "서울 종로구 세종대로 175", rating: 3.5,
    menu: "싱글 오리진", menus: [{ name: "싱글 오리진", price: 7000 }], price_range: 7000, price_level: 2,
    review: "무난하게 깔끔한 한 잔.", visited_at: "2026-09-09", keywords: ["혼밥"],
    lat: 37.5759, lng: 126.9769, photo_url: photo("☕", "#e4d6c8", "#7a5c42"), photo_urls: [photo("☕", "#e4d6c8", "#7a5c42")],
    verified: false,
  }),
  rec({
    id: 6, name: "연남 파스타집", category: "양식", region: "서울 마포구", address: "서울 마포구 연남동 228-5", rating: 4.0,
    menu: "봉골레", menus: [{ name: "봉골레", price: 19000 }, { name: "라구 리가토니", price: 21000 }], price_range: 19000, price_level: 3,
    review: "면이 약간 꼬들하게 나와서 좋았다.", visited_at: "2026-08-30", keywords: ["데이트", "분위기"],
    lat: 37.5617, lng: 126.9255, photo_url: photo("🍝", "#efd9c2", "#a8853f"), photo_urls: [photo("🍝", "#efd9c2", "#a8853f")],
    verified: true, acc: 20, verified_at: "2026-08-30T10:20:00Z",
    from_wish: { saved_at: "2026-08-11T00:00:00Z", days: 19, planned: true },
  }),
  rec({
    id: 7, name: "서울역 우동", category: "일식", region: "서울 용산구", address: "서울 용산구 한강대로 405", rating: 3.5,
    menu: "가케우동", menus: [{ name: "가케우동", price: 8500 }], price_range: 8500, price_level: 1,
    review: "기차 시간 전에 후루룩.", visited_at: "2026-08-17", keywords: ["혼밥", "가성비"],
    lat: 37.5547, lng: 126.9707, photo_url: photo("🍲", "#e6e1d2", "#6f8455"), photo_urls: [photo("🍲", "#e6e1d2", "#6f8455")],
    verified: false,
  }),
  rec({
    id: 8, kind: "cafe", name: "소금빵 베이커리", category: "베이커리", region: "서울 중구", address: "서울 중구 퇴계로 100", rating: 4.5,
    menu: "소금빵", menus: [{ name: "소금빵", price: 4200 }, { name: "크루아상", price: 4800 }], price_range: 9000, price_level: 2,
    review: "갓 구운 소금빵은 겉이 바삭하고 버터 향이 진하다.", revisit: true, visited_at: "2026-07-26", keywords: ["동네", "혼밥"],
    lat: 37.5601, lng: 126.9902, photo_url: photo("🥐", "#f3e2bb", "#a8853f"), photo_urls: [photo("🥐", "#f3e2bb", "#a8853f")],
    verified: true, acc: 8, verified_at: "2026-07-26T01:55:00Z",
  }),
  rec({
    id: 9, name: "마포 숯불갈비", category: "한식", region: "서울 마포구", address: "서울 마포구 도화동 169", rating: null,
    visited_at: "2026-10-03", lat: 37.5395, lng: 126.9467, photo_url: photo("🥩", "#e3b99a", "#9a4a52"), photo_urls: [photo("🥩", "#e3b99a", "#9a4a52")],
    verified: true, acc: 12, verified_at: "2026-10-03T10:41:00Z", pending: true,
  }),
  rec({
    id: 10, name: "차 마시는 집", kind: "cafe", category: "차", region: "서울 종로구", address: "서울 종로구 인사동길 12", rating: 4.0,
    menu: "오미자차", menus: [{ name: "오미자차", price: 8000 }], price_range: 8000, price_level: 2,
    review: "조용해서 책 읽기 좋다.", visited_at: "2026-06-13", keywords: ["분위기", "혼밥"],
    lat: 37.5718, lng: 126.9858, photo_url: photo("🍵", "#dfe8e2", "#4f7a6a"), photo_urls: [photo("🍵", "#dfe8e2", "#4f7a6a")],
    verified: false,
  }),
];

const wish = (w: Partial<Wish> & Pick<Wish, "id" | "name">): Wish => ({
  where_text: null, category: null, note: null, plan_date: null, notify: false, lat: null, lng: null, saved_at: "2026-09-20T00:00:00Z", created_at: "2026-09-20T00:00:00Z", ...w,
});

export const sampleWishes: Wish[] = [
  wish({ id: "w1", name: "성수 베이글 맛집", where_text: "서울 성동구 성수동", category: "베이커리", note: "https://example.com/bagel 웨이팅 길다는데 평일 오픈런?", plan_date: "2026-10-11", notify: true, lat: 37.5665, lng: 126.9985 }),
  wish({ id: "w2", name: "을밀대", where_text: "서울 마포구 숭의동", category: "한식", note: "평양냉면, 꼭 한번", plan_date: "2026-10-18", notify: true, lat: 37.5528, lng: 126.9617 }),
  wish({ id: "w3", name: "한남 와인바", where_text: "서울 용산구 한남동", category: "양식", note: "친구랑 금요일 저녁", lat: 37.5388, lng: 126.9978 }),
  wish({ id: "w4", name: "인사동 전통찻집", where_text: "서울 종로구 인사동", category: "차", lat: 37.5742, lng: 126.9849 }),
];

export const sampleAccount: AccountInfo = {
  nickname: "다이너리",
  avatarUrl: null,
  since: "2026-03-02T09:00:00Z",
  providers: ["kakao", "google"],
  titleLabelId: "verified",
};

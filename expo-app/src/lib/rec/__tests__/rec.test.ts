import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPool, chainOf } from "../candidates";
import { kakaoCategory } from "../categories";
import { REC_CONFIG } from "../config";
import { componentDiagnostics, coverage, cuisineDistribution, distanceDistribution, diversityAt, ndcgAt, retrievalCompleteness } from "../eval";
import { similarity } from "../mmr";
import { buildContext, recommend } from "../pipeline";
import { features, score } from "../score";
import { buildTaste, tasteOf } from "../taste";
import { AT, at, HERE, input, kakao, neighborhood, row, stat, TODAY, wish } from "./fixtures";

const keys = (r: ReturnType<typeof recommend>) => r.picks.map((p) => p.c.key);
const pool1 = (p: Parameters<typeof buildPool>[0]["kakao"], extra: Partial<Parameters<typeof buildPool>[0]> = {}) =>
  buildPool({ here: HERE, radius: 1500, kakao: p, stats: [], rows: [], wishes: [], ...extra });

describe("Algorithm A — 베이지안 취향", () => {
  it("별점 하나로 취향을 과하게 믿지 않는다(수축)", () => {
    const one = buildTaste({ rows: [row({ name: "a", category: "일식", rating: 5, visited_at: "2026-10-10" })], wishes: [], bookId: "personal", today: TODAY });
    const three = buildTaste({
      rows: ["a", "b", "c"].map((n) => row({ name: n, category: "일식", rating: 5, visited_at: "2026-10-10" })), wishes: [], bookId: "personal", today: TODAY,
    });
    const t1 = tasteOf(one, "일식");
    const t3 = tasteOf(three, "일식");
    assert.ok(t1 > 0.5 && t1 < 0.65, `one 5-star → ${t1}`);
    assert.ok(t3 > t1, "evidence accumulates");
    assert.ok(t3 < 1);
  });

  it("평소보다 낮은 별점은 그 종류를 중립 아래로", () => {
    const rows = [
      ...["a", "b", "c", "d"].map((n) => row({ name: n, category: "한식", rating: 4.5 })),
      row({ name: "e", category: "중식", rating: 2 }), row({ name: "f", category: "중식", rating: 2.5 }),
    ];
    const p = buildTaste({ rows, wishes: [], bookId: "personal", today: TODAY });
    assert.ok(tasteOf(p, "중식") < 0.5);
    assert.ok(tasteOf(p, "한식") > tasteOf(p, "중식"));
  });

  it("콜드 스타트: 기록 0 → 모든 종류 사전값, 그래도 5곳 추천", () => {
    const p = buildTaste({ rows: [], wishes: [], bookId: "personal", today: TODAY });
    assert.equal(p.meals, 0);
    assert.equal(tasteOf(p, "한식"), REC_CONFIG.taste.prior);
    const r = recommend(input());
    assert.equal(r.picks.length, 5);
    for (const s of r.picks) assert.ok(s.reasons.length >= 1);
  });

  it("별점 없는 방문은 횟수가 많아도 중립 근처(빈도 ≠ 만족), revisit=false 를 싫음으로 보지 않는다", () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ name: `중${i}`, category: "중식", rating: null, revisit: false }));
    const t = tasteOf(buildTaste({ rows, wishes: [], bookId: "personal", today: TODAY }), "중식");
    assert.ok(t >= 0.5 && t < 0.54, `unrated → ${t}`);
  });

  it("오래된 기록은 덜 무겁다(최근성)", () => {
    const recent = buildTaste({ rows: [row({ name: "a", category: "양식", rating: 5, visited_at: "2026-10-01" })], wishes: [], bookId: "personal", today: TODAY });
    const old = buildTaste({ rows: [row({ name: "a", category: "양식", rating: 5, visited_at: "2024-10-01" })], wishes: [], bookId: "personal", today: TODAY });
    assert.ok(tasteOf(recent, "양식") > tasteOf(old, "양식"));
  });
});

describe("연인 · 개인 기록장 분리", () => {
  it("다른 기록장 기록 · 위시는 취향에 섞이지 않는다", () => {
    const rows = [
      row({ name: "p1", category: "일식", rating: 5, book_id: "personal" }),
      row({ name: "p2", category: "일식", rating: 5, book_id: "personal" }),
      row({ name: "c1", category: "한식", rating: 4, book_id: "couple" }),
    ];
    const wishes = [wish({ name: "pw", category: "일식", book_id: "personal" })];
    const couple = buildTaste({ rows, wishes, bookId: "couple", today: TODAY });
    assert.equal(couple.meals, 1);
    assert.equal(couple.cats.has("일식"), false);
    const r = recommend(input({ bookId: "couple", couple: true, rows, wishes, kakao: [kakao("9", "p1", "일식", 100)] }));
    assert.equal(r.picks[0].c.visits.length, 0, "personal visit must not attach in couple book");
  });

  it("연인 기록장의 별점은 두 사람 메모의 평균", () => {
    const r = row({ name: "c", category: "양식", rating: 5, book_id: "couple" });
    const p = buildTaste({ rows: [r], wishes: [], bookId: "couple", today: TODAY, notes: [{ record_id: r.id, rating: 5 }, { record_id: r.id, rating: 1 }] });
    assert.equal(p.ratingOf(r), 3);
  });
});

describe("Algorithm B — 거리 감쇠", () => {
  it("멀수록 D 가 줄어든다(단조) — 편한 거리 안은 같고, 그 밖은 엄격히 감소", () => {
    const ctx = buildContext(input());
    const D = (m: number) => features(pool1([kakao("1", "x", "한식", m)], { radius: 5000 })[0], ctx).x.distance;
    const ds = [0, 100, 200, 300, 500, 1000, 2000, 3000].map(D);
    for (let i = 1; i < ds.length; i++) assert.ok(ds[i] <= ds[i - 1]);
    assert.equal(D(0), D(200));
    for (const [a, b] of [[300, 500], [500, 1000], [1000, 2000], [2000, 3000]]) assert.ok(D(b) < D(a));
  });

  it("거리가 큰 취향 차이를 뒤집지 않는다", () => {
    const rows = ["a", "b", "c", "d"].map((n) => row({ name: n, category: "일식", rating: 5 }))
      .concat(["e", "f", "g"].map((n) => row({ name: n, category: "중식", rating: 2 })));
    const ctx = buildContext(input({ rows }));
    const [near] = pool1([kakao("1", "가까운중식", "중식", 150)]);
    const [far] = pool1([kakao("2", "먼일식", "일식", 900)]);
    assert.ok(score(far, ctx).score > score(near, ctx).score);
  });
});

describe("Algorithm C — 반복 회피", () => {
  it("어제 먹은 종류는 부드럽게 감점(빼지는 않음)", () => {
    const rows = [row({ name: "어제집", category: "한식", visited_at: "2026-10-15" })];
    const ctx = buildContext(input({ rows }));
    const ctx0 = buildContext(input());
    const [c] = pool1([kakao("1", "한식집", "한식", 200)]);
    const pen = score(c, ctx);
    assert.ok(pen.repetition.cuisine > 0);
    assert.ok(pen.score < score(c, ctx0).score);
    const r = recommend(input({ rows, kakao: [kakao("1", "한식집", "한식", 200)] }));
    assert.equal(r.picks.length, 1, "still eligible");
  });

  it("먹고 싶다고 고른 종류는 종류 감점 없음", () => {
    const rows = [row({ name: "어제집", category: "한식", visited_at: "2026-10-15" })];
    const ctx = buildContext(input({ rows, filter: { inc: ["한식"], exc: [] } }));
    const [c] = pool1([kakao("1", "한식집", "한식", 200)]);
    assert.equal(score(c, ctx).repetition.cuisine, 0);
  });

  it("어제 간 가게는 크게, 석 달 전 간 가게는 거의 감점 없음", () => {
    const k = kakao("1", "단골", "양식", 200);
    const mk = (d: string) => [row({ name: "단골", category: "양식", visited_at: d, ...at(200) })];
    const rY = score(pool1([k], { rows: mk("2026-10-15") })[0], buildContext(input({ rows: mk("2026-10-15") }))).repetition.place;
    const rOld = score(pool1([k], { rows: mk("2026-07-01") })[0], buildContext(input({ rows: mk("2026-07-01") }))).repetition.place;
    assert.ok(rY > 0.15 && rOld < 0.001);
  });
});

describe("Algorithm D — 위시 · 단골 · 새로움", () => {
  it("위시에 담은 곳이 같은 조건의 다른 곳보다 위", () => {
    const k = [kakao("1", "담은집", "한식", 300), kakao("2", "그냥집", "한식", 300, 5)];
    const w = wish({ name: "담은집", ...at(300) });
    const r = recommend(input({ kakao: k, wishes: [w] }));
    assert.equal(r.picks[0].c.name, "담은집");
    assert.ok(r.picks[0].reasons.some((t) => t.includes("위시리스트")));
  });

  it("새로움은 취향이 안 맞는 종류를 메우지 못한다(gate)", () => {
    const rows = ["e", "f", "g", "h"].map((n) => row({ name: n, category: "중식", rating: 1.5 })).concat(row({ name: "z", category: "한식", rating: 4.5 }));
    const ctx = buildContext(input({ rows }));
    const [c] = pool1([kakao("1", "새중식", "중식", 200)]);
    assert.equal(features(c, ctx).x.novelty, 0);
  });
});

describe("강한 조건 · 후보 정리", () => {
  it("빼고 싶은 종류는 점수와 상관없이 빠진다", () => {
    const rows = ["a", "b", "c"].map((n) => row({ name: n, category: "일식", rating: 5 }));
    const r = recommend(input({ rows, filter: { inc: [], exc: ["일식"] } }));
    assert.ok(r.picks.every((p) => p.c.cat.recCat !== "일식"));
    assert.ok(r.picks.length === 5);
  });

  it("먹고 싶은 종류를 고르면 그 종류만", () => {
    const r = recommend(input({ filter: { inc: ["면"], exc: [] } }));
    assert.ok(r.picks.length > 0 && r.picks.every((p) => p.c.cat.recCat === "면"));
  });

  it("술집 · 간식 · 카페는 식사 추천 대상이 아니다", () => {
    assert.equal(kakaoCategory("음식점 > 술집 > 호프,요리주점").eligible, false);
    assert.equal(kakaoCategory("음식점 > 간식 > 제과,베이커리").eligible, false);
    assert.equal(kakaoCategory("음식점 > 카페").eligible, false);
    assert.equal(kakaoCategory("음식점 > 한식 > 해장국").recCat, "국밥·탕");
    assert.equal(kakaoCategory("음식점 > 일식 > 일본식라면").recCat, "면");
    const r = recommend(input({ kakao: [kakao("1", "호프", "술집", 100), kakao("2", "빵집", "간식", 120), kakao("3", "밥집", "한식", 300)] }));
    assert.deepEqual(r.picks.map((p) => p.c.name), ["밥집"]);
  });

  it("카카오 id · 이름+100m 로 같은 가게를 합치고, 먼 같은 이름은 다른 지점", () => {
    const k = kakao("777", "성수국밥", "국밥·탕", 300);
    const s = stat({ place: "성수국밥|addr", name: "성수국밥", north: 305, place_url: "https://place.map.kakao.com/777" });
    const h = row({ name: "성수 국밥", category: "한식", ...at(330), rating: 4 });
    const branch = kakao("778", "성수국밥", "국밥·탕", 900);
    const pool = buildPool({ here: HERE, radius: 1500, kakao: [k, branch], stats: [s], rows: [h], wishes: [] });
    assert.equal(pool.length, 2);
    const main = pool.find((c) => c.kakaoId === "777")!;
    assert.deepEqual(main.sources.sort(), ["community", "history", "kakao"]);
    assert.equal(main.visits.length, 1);
    assert.equal(pool.find((c) => c.kakaoId === "778")!.visits.length, 0);
    assert.equal(chainOf("스타벅스 성수역점"), chainOf("스타벅스 서울숲점"));
  });
});

describe("Stage C — MMR 다양성", () => {
  it("한 종류가 점수를 휩쓸어도 5곳에 여러 종류가 섞인다", () => {
    const rows = ["a", "b", "c", "d"].map((n) => row({ name: n, category: "한식", rating: 4.8 }))
      .concat(row({ name: "e", category: "양식", rating: 3.5 }));
    const k = [
      ...Array.from({ length: 8 }, (_, i) => kakao(`h${i}`, `한${i}`, "한식", 100 + i * 40)),
      kakao("y1", "양1", "양식", 400), kakao("j1", "일1", "일식", 450), kakao("c1", "중1", "중식", 500),
    ];
    const r = recommend(input({ rows, kakao: k }));
    const cats = new Set(r.picks.map((p) => p.c.cat.recCat));
    assert.ok(cats.size >= 2, `cuisines ${[...cats]}`);
    assert.ok(r.picks.filter((p) => p.c.cat.recCat === "한식").length >= 2, "strong preference preserved");
  });

  it("뚜렷한 취향은 2–3곳을 지키되 5곳을 다 차지하지는 않는다(포화)", () => {
    const rows = ["a", "b", "c"].map((n) => row({ name: n, category: "일식", rating: 5, visited_at: "2026-10-01" }))
      .concat(row({ name: "d", category: "한식", rating: 3.5 }), row({ name: "e", category: "양식", rating: 3.5 }));
    const cats = ["일식", "한식", "양식", "중식", "분식", "고기"];
    const k = Array.from({ length: 30 }, (_, i) => kakao(`p${i}`, `곳${i}`, i < 12 ? "일식" : cats[1 + (i % 5)], 60 + i * 7, (i % 4) * 50));
    const n = recommend(input({ rows, kakao: k })).picks.filter((p) => p.c.cat.recCat === "일식").length;
    assert.ok(n >= 2 && n <= 3, `일식 ${n}곳`);
  });

  it("먹고 싶은 종류를 고르면 종류 유사도를 줄인다", () => {
    const [a, b] = pool1([kakao("1", "a", "한식", 100), kakao("2", "b", "한식", 1200)]);
    assert.ok(similarity(a, b, true) < similarity(a, b, false));
  });

  it("같은 체인의 다른 지점은 함께 고르지 않는다", () => {
    const k = [kakao("1", "김밥천국 성수점", "분식", 100), kakao("2", "김밥천국 뚝섬점", "분식", 600), kakao("3", "다른집", "양식", 700)];
    const r = recommend(input({ kakao: k, filter: { inc: [], exc: [] } }));
    assert.deepEqual(r.picks.slice(0, 2).map((p) => p.c.name).sort(), ["김밥천국 성수점", "다른집"].sort());
  });
});

describe("결정성 · 다시 추천", () => {
  it("같은 입력이면 같은 결과, 입력 순서를 섞어도 같다", () => {
    const a = recommend(input());
    const b = recommend(input());
    const c = recommend(input({ kakao: [...neighborhood()].reverse() }));
    assert.deepEqual(keys(a), keys(b));
    assert.deepEqual(keys(a), keys(c));
  });

  it("다시 추천은 앞서 보여 준 곳과 겹치지 않는 5곳", () => {
    const first = recommend(input());
    const second = recommend(input({ avoid: keys(first) }));
    assert.equal(second.picks.length, 5);
    assert.equal(keys(second).filter((k) => keys(first).includes(k)).length, 0);
    assert.equal(second.cycled, false);
  });

  it("후보가 모자라면 앞서 본 곳을 다시 쓰고 cycled 로 알린다", () => {
    const small = neighborhood().slice(0, 7);
    const first = recommend(input({ kakao: small }));
    const second = recommend(input({ kakao: small, avoid: keys(first) }));
    assert.equal(second.picks.length, 5);
    assert.equal(second.cycled, true);
  });
});

describe("Algorithm E — 날씨", () => {
  it("날씨를 모르면 날씨 성분은 모두 중립", () => {
    const ctx = buildContext(input());
    for (const c of pool1(neighborhood())) assert.equal(features(c, ctx).x.context, REC_CONFIG.neutral.context);
  });

  it("비가 오면 가까운 곳이 조금 더 앞(작은 영향)", () => {
    const rain = { tempC: 14, rainMm: 3, precip: true, observedAt: "2026-10-16T03:00:00Z" };
    const [near, far] = pool1([kakao("1", "n", "한식", 150), kakao("2", "f", "한식", 1200)]);
    const dry = buildContext(input());
    const wet = buildContext(input({ weather: rain }));
    const gap = (ctx: typeof dry) => score(near, ctx).score - score(far, ctx).score;
    assert.ok(gap(wet) > gap(dry));
    assert.ok(gap(wet) - gap(dry) < 0.12, "weather influence stays small");
  });
});

describe("Stage A — 반경 넓히기 · 대체", () => {
  it("1.5km 안 후보가 모자라면 3km 로 넓히고, 카카오를 더 받아야 하면 알린다", () => {
    const k = [kakao("1", "a", "한식", 300), kakao("2", "b", "양식", 2500)];
    const r = recommend(input({ kakao: k }));
    assert.equal(r.radius, 3000);
    assert.equal(r.wantRadius, 3000);
    assert.deepEqual(r.relax, { kind: "wider", radius: 3000 });
    assert.equal(r.picks.length, 2);
  });

  it("카카오가 실패해도 Dinary 기록 · 위시로 추천한다", () => {
    const w = wish({ name: "먼위시", ...at(6000) });
    const s = stat({ place: "s1", name: "인증집", north: 400, slot_dow: 2 });
    const r = recommend(input({ kakao: [], kakaoRadius: null, stats: [s], wishes: [w] }));
    assert.deepEqual(r.picks.map((p) => p.c.name), ["인증집", "먼위시"]);
    assert.equal(r.relax.kind, "mine");
    assert.equal(r.wantRadius, null);
  });
});

describe("평가 도구", () => {
  it("NDCG · 다양성 · 분포 · 완전성 · 성분 진단", () => {
    assert.equal(ndcgAt(["a", "b"], { a: 3, b: 1 }), 1);
    assert.ok(ndcgAt(["b", "a"], { a: 3, b: 1 }) < 1);
    const r = recommend(input());
    const picks = r.picks.map((p) => p.c);
    const all = pool1(neighborhood());
    assert.ok(diversityAt(picks) > 0 && diversityAt(picks) <= 1);
    assert.equal(distanceDistribution(picks).n, 5);
    assert.equal(Object.values(cuisineDistribution(picks)).reduce((a, b) => a + b, 0), 5);
    assert.ok(coverage([picks], all) > 0);
    assert.equal(retrievalCompleteness(all, ["kakao:1000", "kakao:1001"]), 1);
    const diag = componentDiagnostics(r.ranked);
    const share = Object.values(diag).reduce((s, d) => s + d.share, 0);
    assert.ok(Math.abs(share - 1) < 1e-9 || share === 0);
  });
});

describe("시뮬레이션 시나리오(가짜 사용자 — 실제 성과 아님)", () => {
  it("일식을 좋아하고 어제 한식을 먹은 사용자, 근처 위시 하나", () => {
    const rows = [
      row({ name: "스시A", category: "일식", rating: 5, revisit: true, visited_at: "2026-09-20", verified_at: "2026-09-20T03:40:00Z" }),
      row({ name: "스시B", category: "일식", rating: 4.5, visited_at: "2026-08-02", verified_at: "2026-08-02T03:10:00Z" }),
      row({ name: "라멘C", category: "일식", rating: 4.5, visited_at: "2026-07-11" }),
      row({ name: "백반D", category: "한식", rating: 3.5, visited_at: "2026-10-15" }),
      row({ name: "파스타E", category: "양식", rating: 2.5, visited_at: "2026-06-01" }),
    ];
    const w = wish({ name: "가게5", category: "아시안", ...at(-(100 + 60 * 5), (5 % 3) * 80) });
    const r = recommend(input({ rows, wishes: [w] }));
    const cats = r.picks.map((p) => p.c.cat.recCat);
    assert.ok(r.picks.some((p) => p.c.wish), "wish surfaces");
    assert.ok(cats.includes("일식"), "liked cuisine surfaces");
    assert.ok(new Set(cats).size >= 3, "diverse");
    const diag = {
      picks: r.picks.map((p) => `${p.c.name}(${p.c.cat.recCat}, ${p.c.distance}m, ${p.score.toFixed(3)})`),
      diversity: diversityAt(r.picks.map((p) => p.c)).toFixed(3),
      distance: distanceDistribution(r.picks.map((p) => p.c)),
    };
    console.log("[simulated scenario]", JSON.stringify(diag));
    assert.equal(r.ctx.slot, "lunch");
    assert.equal(AT.toISOString(), "2026-10-16T03:30:00.000Z");
  });
});

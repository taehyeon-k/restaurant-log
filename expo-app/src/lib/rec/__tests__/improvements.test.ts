import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPool } from "../candidates";
import { kakaoCategory, recordCategory } from "../categories";
import { REC_CONFIG } from "../config";
import { createDeliveryCache } from "../delivery";
import { compareRankers, groupDiagnostics, outcomeSummary, rankingDiagnostics } from "../eval";
import { exploreLastSlot } from "../exploration";
import { mmr } from "../mmr";
import { buildContext, recommend } from "../pipeline";
import { routineMultiplier } from "../routine";
import { personalSatisfaction } from "../satisfaction";
import { score } from "../score";
import { featureSnapshot, resultSignature, storedLogRank } from "../snapshot";
import { buildTaste, preferenceFor, ratingFn, ratingSignal } from "../taste";
import { at, HERE, input, kakao, row, stat, TODAY, wish } from "./fixtures";

const pool = (k: ReturnType<typeof kakao>[]) => buildPool({ here: HERE, radius: 3000, kakao: k, stats: [], rows: [], wishes: [] });
const profile = (rows: ReturnType<typeof row>[]) => buildTaste({ rows, wishes: [], bookId: "personal", today: TODAY });

describe("v4 evidence and hierarchical taste", () => {
  it("keeps cuisine independent of dish and preserves legacy filter categories", () => {
    const ramen = kakaoCategory("음식점 > 일식 > 일본식라면");
    assert.equal(ramen.cuisine, "일식");
    assert.equal(ramen.dish, "라멘");
    assert.equal(ramen.recCat, "면");
    assert.equal(recordCategory("일식", "일반식당").dish, null);
    assert.equal(recordCategory("일식", "일반식당", "restaurant", ["돈카츠"]).dish, "돈까스");
    assert.equal(recordCategory("일식", "스시집", "restaurant", ["초밥", "라멘"]).dish, null);
    assert.equal(recordCategory("일식", "일반식당", "restaurant", ["초밥 + 라멘 세트"]).dish, null);
  });

  it("maps Kakao fast food and bars onto the new diary categories", () => {
    const burger = kakaoCategory("음식점 > 패스트푸드 > 맥도날드");
    assert.equal(burger.base, "패스트푸드");
    assert.equal(burger.eligible, true);
    assert.equal(kakaoCategory("음식점 > 치킨 > 교촌치킨").base, "패스트푸드");
    const fastFood = recordCategory("패스트푸드", "버거집");
    assert.equal(fastFood.recCat, null);
    assert.equal(fastFood.base, "패스트푸드");
    const bar = recordCategory("술집", "동네호프");
    assert.equal(bar.recCat, null);
    assert.equal(bar.eligible, false);
  });

  it("distinguishes liked sushi from disliked ramen with cuisine fallback for unknown dishes", () => {
    const p = profile([
      ...["A", "B", "C"].map((id) => row({ name: `스시${id}`, category: "일식", rating: 5 })),
      ...["A", "B", "C"].map((id) => row({ name: `라멘${id}`, category: "일식", rating: 1.5 })),
    ]);
    const sushi = preferenceFor(p, kakaoCategory("음식점 > 일식 > 초밥,롤"));
    const ramen = preferenceFor(p, kakaoCategory("음식점 > 일식 > 일본식라면"));
    const generic = preferenceFor(p, kakaoCategory("음식점 > 일식"));
    assert.equal(sushi.level, "dish");
    assert.equal(ramen.level, "dish");
    assert.ok(sushi.value > generic.value && ramen.value < generic.value);
    assert.ok(sushi.value > 0.6 && ramen.value < 0.5);
    assert.equal(generic.level, "cuisine");
  });

  it("caps one restaurant's influence and counts distinct places in explanations", () => {
    const repeated = profile(Array.from({ length: 20 }, () => row({ name: "스시A", category: "일식", rating: 5 })));
    const varied = profile(["A", "B", "C"].map((id) => row({ name: `스시${id}`, category: "일식", rating: 5 })));
    const category = kakaoCategory("음식점 > 일식 > 초밥,롤");
    assert.equal(preferenceFor(repeated, category).ratedPlaces, 1);
    assert.ok(preferenceFor(varied, category).confidence > preferenceFor(repeated, category).confidence);
    assert.ok(repeated.cuisines.get("일식")!.weight <= 1);
  });

  it("uses explicit menu votes instead of assuming every dish shares the restaurant rating", () => {
    const p = profile(["A", "B", "C"].map((id) => row({
      name: `일식${id}`, category: "일식", rating: 5,
      menus: [{ name: "초밥", vote: 1 }, { name: "라멘", vote: -1 }],
    })));
    const sushi = preferenceFor(p, kakaoCategory("음식점 > 일식 > 초밥,롤"));
    const ramen = preferenceFor(p, kakaoCategory("음식점 > 일식 > 일본식라면"));
    assert.ok(sushi.value > 0.6);
    assert.ok(ramen.value < 0.5);
    assert.equal(sushi.positivePlaces, 3);
    assert.equal(ramen.positivePlaces, 0);
  });

  it("does not turn a good rating into dislike just because the user rates generously", () => {
    assert.ok(ratingSignal(4, 4.8) > 0.5);
    assert.ok(ratingSignal(2, 4.8) < 0.5);
    const p = profile([row({ name: "bad", rating: Number.NaN }), row({ name: "future", rating: 5, visited_at: "2027-01-01" })]);
    assert.equal(p.meals, 1);
    assert.equal(p.cats.get("한식")!.rated, 0);
  });

  it("keeps satisfaction neutral without ratings and lets poor ratings reduce it", () => {
    const rows = Array.from({ length: 10 }, () => row({ name: "frequent" }));
    assert.equal(personalSatisfaction(rows, TODAY, ratingFn()).value, 0.5);
    assert.equal(personalSatisfaction(rows, TODAY, ratingFn()).confidence, 0);
    assert.ok(personalSatisfaction([row({ name: "bad", rating: 1 })], TODAY, ratingFn()).value < 0.5);
    assert.ok(personalSatisfaction([row({ name: "good", rating: 5 })], TODAY, ratingFn()).value > 0.5);
  });

  it("prefers an otherwise equal wishlist at 800m over an unknown option at 300m", () => {
    const result = recommend(input({
      kakao: [kakao("1", "saved", "한식", 800), kakao("2", "unknown", "한식", 300)],
      wishes: [wish({ name: "saved", ...at(800) })],
    }));
    assert.equal(result.picks[0].c.key, "kakao:1");
  });

  it("lets a well-rated favorite beat an equally suitable novel place after a reasonable gap", () => {
    const rows = ["2026-09-01", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-30"].map((visited_at) => row({
      name: "favorite", category: "한식", rating: 5, visited_at, ...at(200),
    }));
    const result = recommend(input({ rows, kakao: [kakao("1", "favorite", "한식", 200), kakao("2", "unknown", "한식", 200)] }));
    assert.equal(result.picks[0].c.key, "kakao:1");
  });

  it("does not claim known taste or restaurant quality for cold start or wishlist-only users", () => {
    const k = [kakao("1", "새스시", "일식", 200)];
    for (const wishes of [[], [wish({ name: "다른집", category: "일식" })]]) {
      const p = recommend(input({ kakao: k, wishes })).picks[0];
      assert.ok(p.reasons.every((reason) => !/취향에 맞|좋게 평가|평소보다|다시 가고 싶/.test(reason)));
      assert.equal(p.evidence.personal.confidence, 0);
      assert.equal(p.evidence.communityConfidence, 0);
    }
  });

  it("uses distinct positively rated places before explaining a dish preference", () => {
    const rows = ["A", "B", "C"].map((id) => row({ name: `스시${id}`, category: "일식", rating: 5 }));
    const p = recommend(input({ rows, kakao: [kakao("1", "새스시", "일식", 200)] })).picks[0];
    assert.ok(p.reasons.some((reason) => reason.includes("초밥") && reason.includes("3곳")));
    const repeated = recommend(input({ rows: Array.from({ length: 10 }, () => rows[0]), kakao: [kakao("1", "새스시", "일식", 200)] })).picks[0];
    assert.ok(repeated.reasons.every((reason) => !reason.includes("좋게 평가한")));
  });
});

describe("v4 repetition, context, and eligibility", () => {
  const recent = (rating: number | null) => ["2026-10-01", "2026-10-05", "2026-10-09", "2026-10-15"].map((date) => row({ name: "regular", rating, visited_at: date, ...at(200) }));

  it("relaxes repetition only for repeated positive experiences, not duplicate or unrated records", () => {
    const positive = recent(5), unrated = recent(null), poor = recent(2);
    assert.ok(routineMultiplier(positive, TODAY, ratingFn()) < 1);
    assert.equal(routineMultiplier(unrated, TODAY, ratingFn()), 1);
    assert.equal(routineMultiplier(poor, TODAY, ratingFn()), 1);
    assert.equal(routineMultiplier(Array.from({ length: 20 }, () => positive[0]), TODAY, ratingFn()), 1);
    const penalty = (rows: typeof positive) => recommend(input({ rows, kakao: [kakao("1", "regular", "한식", 200)] })).picks[0].repetition;
    assert.ok(penalty(positive).place < penalty(unrated).place);
    assert.ok(penalty(positive).cuisine < penalty(unrated).cuisine);
    assert.ok(penalty(positive).place > 0, "routine is not a free pass for same-day repeats");
  });

  it("does not leak another book's routine and taste", () => {
    const r = recommend(input({ bookId: "couple", couple: true, rows: recent(5), kakao: [kakao("1", "regular", "한식", 200)] }));
    assert.equal(r.ctx.taste.meals, 0);
    assert.equal(r.ctx.taste.routineByCat.size, 0);
    assert.equal(r.picks[0].evidence.personal.confidence, 0);
  });

  it("counts recent cuisine dates once even when there are duplicate records", () => {
    const one = row({ name: "yesterday", visited_at: "2026-10-15" });
    const penalty = (rows: typeof one[]) => recommend(input({ rows, kakao: [kakao("1", "other", "한식", 200)] })).picks[0].repetition.cuisine;
    assert.equal(penalty([one]), penalty([one, one, one]));
  });

  it("applies weather through distance only and ignores stale observations", () => {
    const rain = { tempC: 10, rainMm: 3, precip: true, observedAt: "2026-10-16T03:00:00Z" };
    const candidate = pool([kakao("1", "x", "한식", 800)])[0];
    const dry = score(candidate, buildContext(input()));
    const wet = score(candidate, buildContext(input({ weather: rain })));
    const stale = score(candidate, buildContext(input({ weather: { ...rain, observedAt: "2026-10-15T03:00:00Z" } })));
    assert.ok(wet.x.distance < dry.x.distance);
    assert.equal(wet.contrib.context, 0);
    for (const key of Object.keys(dry.x) as (keyof typeof dry.x)[]) if (key !== "distance") assert.equal(wet.x[key], dry.x[key]);
    assert.equal(stale.score, dry.score);
  });

  it("does not double-count same-weekday visits inside all-weekday meal activity", () => {
    const a = stat({ place: "p", name: "x", north: 200, slot_any: 5, slot_dow: 0 });
    const x = recommend(input({ kakao: [], stats: [a] })).picks[0].x.meal;
    const y = recommend(input({ kakao: [], stats: [{ ...a, slot_dow: 3 }] })).picks[0].x.meal;
    assert.equal(x, y);
  });

  it("honors cuisine exclusions across dish categories, with exclusions winning conflicts", () => {
    const k = [kakao("1", "라멘", "음식점 > 일식 > 일본식라면", 200)];
    assert.equal(recommend(input({ kakao: k, filter: { inc: ["일식"], exc: [] } })).picks.length, 1);
    assert.equal(recommend(input({ kakao: k, filter: { inc: ["면"], exc: ["일식"] } })).picks.length, 0);
    assert.equal(recommend(input({ kakao: k, filter: { inc: ["면"], exc: ["면"] } })).picks.length, 0);
  });
});

describe("v4 diagnostics and measurement", () => {
  it("compares simple baselines and reports feature ablations without outcome claims", () => {
    const rows = ["a", "b", "c", "d"].map((name) => row({ name, category: "일식", rating: 5 }))
      .concat(["e", "f", "g"].map((name) => row({ name, category: "중식", rating: 1 })));
    const candidates = pool([kakao("1", "near", "중식", 150), kakao("2", "far", "일식", 850)]);
    const ctx = buildContext(input({ rows }));
    const scored = candidates.map((c) => score(c, ctx));
    const comparisons = compareRankers(scored, { previousKeys: ["kakao:1", "kakao:2"] });
    assert.equal(comparisons.find((c) => c.name === "distance-only")!.keys[0], "kakao:1");
    assert.equal(comparisons.find((c) => c.name === REC_CONFIG.version)!.keys[0], "kakao:2");
    assert.equal(comparisons.find((c) => c.name === "archived-v3")!.keys[0], "kakao:1");
    const diagnostics = rankingDiagnostics(scored, false);
    assert.ok(diagnostics.ablations.taste.positionsChanged > 0);
    assert.equal(diagnostics.ablations.context.positionsChanged, 0);
    assert.ok(Object.values(groupDiagnostics(scored)).every((g) => Number.isFinite(g.mean)));
    const unjudged = compareRankers(scored, { relevance: { "kakao:1": 2 } });
    assert.ok(unjudged.every((method) => method.ndcg === null && method.judgedCoverage === 0.5));
  });

  it("separates base rank from displayed position and keeps fallback MMR aware of earlier picks", () => {
    const r = recommend(input());
    assert.ok(r.ranked.every((s, i) => i === 0 || s.score <= r.ranked[i - 1].score));
    assert.ok(r.picks.every((s) => s.selection && s.baseRank));
    const scored = pool([kakao("1", "a", "한식", 200), kakao("2", "b", "한식", 205), kakao("3", "c", "양식", 400)]).map((c) => score(c, buildContext(input())));
    const more = mmr(scored.slice(1), 1, { requested: false, initial: [scored[0]] });
    assert.equal(more[0].c.key, "kakao:3");
  });

  it("creates a fresh signature for a changed diary/context even when restaurant keys stay the same", () => {
    const r = recommend(input({ kakao: [kakao("1", "x", "일식", 200)] }));
    const other = recommend(input({ kakao: [kakao("1", "x", "일식", 200)], bookId: "couple", couple: true }));
    assert.notEqual(resultSignature(r, "personal"), resultSignature(other, "couple"));
    const updated = recommend(input({ kakao: [kakao("1", "x", "일식", 200)], rows: [row({ name: "sushi", category: "일식", rating: 5 })] }));
    assert.notEqual(resultSignature(r, "same"), resultSignature(updated, "same"));
    assert.equal(resultSignature(r, "same"), resultSignature(recommend(input({ kakao: [kakao("1", "x", "일식", 200)] })), "same"));
    const snapshot = JSON.stringify(featureSnapshot(r.picks[0]));
    assert.ok(!snapshot.includes('"lat"') && !snapshot.includes('"lng"'));
    assert.equal(storedLogRank(250), 100);
    assert.equal(featureSnapshot({ ...r.picks[0], baseRank: 250 }).base_rank, 250);
  });

  it("counts exposed sessions, verified visits and completed saves separately", () => {
    const summary = outcomeSummary([
      { id: "a", algoVersion: "v4" }, { id: "b", algoVersion: "v4" }, { id: "unseen", algoVersion: "v4" },
    ], [
      { sessionId: "a", type: "impression" }, { sessionId: "a", type: "impression" },
      { sessionId: "b", type: "impression" }, { sessionId: "b", type: "refresh" },
      { sessionId: "a", type: "visit_confirmed", verified: true, recordId: 1, rating: 5 },
      { sessionId: "a", type: "visit_confirmed", verified: true, recordId: 1, rating: 5 },
      { sessionId: "a", type: "wish_saved" },
      { sessionId: "unseen", type: "visit_confirmed", verified: true, recordId: 2, rating: 1 },
    ])[0];
    assert.equal(summary.exposedSessions, 2);
    assert.equal(summary.visitRate, 0.5);
    assert.equal(summary.saveRate, 0.5);
    assert.equal(summary.ratedVisits, 1);
    assert.equal(summary.meanVisitRating, 5);
    assert.equal(summary.refreshWithoutChoiceSessions, 1);
    assert.equal(outcomeSummary([{ id: "none", algoVersion: "new" }], [])[0].visitRate, null);
  });

  it("retries failed delivery and coalesces concurrent calls without caching failure", async () => {
    const cache = createDeliveryCache();
    let attempts = 0;
    const task = async () => { attempts++; return attempts > 1; };
    assert.equal(await cache.run("item", task), false);
    const one = cache.run("item", task), two = cache.run("item", task);
    assert.equal(one, two);
    assert.deepEqual(await Promise.all([one, two]), [true, true]);
    await cache.run("item", task);
    assert.equal(attempts, 2);
    assert.equal(await cache.run("throw", async () => { throw new Error("network"); }), false);
    assert.equal(await cache.run("throw", async () => true), true);
  });
});

describe("v4 gated exploration", () => {
  const scored = () => pool(Array.from({ length: 8 }, (_, i) => kakao(String(i), `place${i}`, "한식", 200))).map((c) => score(c, buildContext(input())));

  it("is disabled by default, reproducible with a seed, and preserves the first four", () => {
    assert.equal(REC_CONFIG.exploration.enabled, false);
    assert.equal(recommend(input()).policy.mode, "disabled");
    const all = scored(), picks = mmr(all, 5, { requested: false });
    const a = exploreLastSlot(picks, all, false, "seed-a"), b = exploreLastSlot(picks, [...all].reverse(), false, "seed-a");
    assert.deepEqual(a, b);
    assert.deepEqual(a.picks.slice(0, 4), picks.slice(0, 4));
    assert.equal(new Set(a.picks.map((s) => s.c.key)).size, 5);
    assert.ok(Math.abs(a.policy.distribution.reduce((sum, p) => sum + p.probability, 0) - 1) < 1e-12);
    assert.ok(a.policy.chosenProbability! > 0);
  });

  it("does not explore worse-fit restaurants or exhausted refresh pools", () => {
    const all = scored(), picks = mmr(all.slice(0, 5), 5, { requested: false });
    const poor = all.slice(5).map((s) => ({ ...s, score: s.score - 0.3, x: { ...s.x, taste: 0.2 } }));
    assert.equal(exploreLastSlot(picks, [...all.slice(0, 5), ...poor], false, "seed").policy.mode, "disabled");
    const first = recommend(input({ kakao: input().kakao.slice(0, 7) }));
    const again = recommend(input({ kakao: input().kakao.slice(0, 7), avoid: first.picks.map((s) => s.c.key), explorationSeed: "seed" }));
    assert.equal(again.cycled, true);
    assert.equal(again.policy.mode, "disabled");
  });

  it("samples near-equal alternatives at approximately the logged probabilities", () => {
    const all = scored(), picks = mmr(all, 5, { requested: false });
    const counts = new Map<string, number>();
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const r = exploreLastSlot(picks, all, false, `independent-session-${i}`);
      counts.set(r.policy.chosenKey!, (counts.get(r.policy.chosenKey!) ?? 0) + 1);
    }
    const { policy } = exploreLastSlot(picks, all, false, "sample");
    assert.ok(counts.size > 1);
    for (const p of policy.distribution) assert.ok(Math.abs((counts.get(p.key) ?? 0) / trials - p.probability) < 0.02);
  });
});

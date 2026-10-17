import { metersBetweenLL } from "../geo";
import type { Candidate } from "./candidates";
import { REC_CONFIG } from "./config";
import type { Scored } from "./score";

/**
 * Stage C — 탐욕적 MMR.
 *   r* = argmax_{r∉S} [ Score(r) − λ · max_{j∈S} Sim(r, j) − λc · max(0, n_c(S) − 1) · w_cuisine ]
 * 둘째 항은 같은 종류가 셋째 · 넷째로 쌓일수록 커지는 포화 감점입니다(config.ts mmr.saturation).
 * Sim: 같은 체인(지점만 다름)이면 1, 아니면 종류 · 세부 종류 · 가격대(둘 다 알 때만) · 가까움의 가중 합.
 * 먹고 싶은 종류를 골랐으면 종류 유사도를 거의 빼서, 원하는 종류끼리 서로 밀어내지 않게 합니다.
 * 「한 곳은 위시, 한 곳은 새로운 곳」 같은 칸 나누기는 하지 않습니다.
 */
export function similarity(a: Candidate, b: Candidate, requested: boolean) {
  if (a.chain && a.chain === b.chain) return 1;
  const s = REC_CONFIG.mmr.sim;
  const sameCuisine = a.cat.cuisine && b.cat.cuisine ? a.cat.cuisine === b.cat.cuisine : a.cat.recCat && a.cat.recCat === b.cat.recCat;
  const cuisine = sameCuisine ? s.cuisine * (requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1) : 0;
  const sameDish = a.cat.dish && b.cat.dish ? a.cat.dish === b.cat.dish : a.cat.sub && a.cat.sub === b.cat.sub;
  const sub = sameDish ? s.sub * (requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1) : 0;
  const price = a.priceLevel != null && a.priceLevel === b.priceLevel ? s.price : 0;
  const geo = s.geo * Math.exp(-metersBetweenLL(a.lat, a.lng, b.lat, b.lng) / s.geoTauM);
  return Math.min(1, cuisine + sub + price + geo);
}

/** 정렬은 점수 → key 로 고정해, 같은 입력이면 늘 같은 결과입니다. */
export const byScore = (a: Scored, b: Scored) => b.score - a.score || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : 0);

export function marginalUtility(s: Scored, chosen: Scored[], opts: { requested: boolean; lambda?: number }) {
  const lambda = opts.lambda ?? REC_CONFIG.mmr.lambda;
  const cuisineSim = REC_CONFIG.mmr.sim.cuisine * (opts.requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1);
  const pen = chosen.reduce((m, j) => Math.max(m, similarity(s.c, j.c, opts.requested)), 0);
  const same = s.c.cat.recCat ? chosen.filter((j) => j.c.cat.recCat === s.c.cat.recCat).length : 0;
  const penalty = lambda * pen + REC_CONFIG.mmr.saturation * Math.max(0, same - 1) * cuisineSim;
  return { penalty, utility: s.score - penalty };
}

export function mmr(scored: Scored[], k: number, opts: { requested: boolean; lambda?: number; initial?: Scored[] }): Scored[] {
  const initial = opts.initial ?? [];
  const taken = new Set(initial.map((s) => s.c.key));
  const pool = scored.filter((s) => !taken.has(s.c.key)).sort(byScore);
  const chosen: Scored[] = [...initial];
  while (chosen.length < k + initial.length && pool.length) {
    let best = 0;
    let bestV = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const v = marginalUtility(pool[i], chosen, opts).utility;
      if (v > bestV + 1e-12) { bestV = v; best = i; }
    }
    const pick = pool.splice(best, 1)[0];
    chosen.push({ ...pick, selection: marginalUtility(pick, chosen, opts) });
  }
  return chosen.slice(initial.length);
}

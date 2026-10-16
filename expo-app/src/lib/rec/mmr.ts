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
  const cuisine = a.cat.recCat && a.cat.recCat === b.cat.recCat ? s.cuisine * (requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1) : 0;
  const sub = a.cat.sub && a.cat.sub === b.cat.sub ? s.sub * (requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1) : 0;
  const price = a.priceLevel != null && a.priceLevel === b.priceLevel ? s.price : 0;
  const geo = s.geo * Math.exp(-metersBetweenLL(a.lat, a.lng, b.lat, b.lng) / s.geoTauM);
  return Math.min(1, cuisine + sub + price + geo);
}

/** 정렬은 점수 → key 로 고정해, 같은 입력이면 늘 같은 결과입니다. */
export const byScore = (a: Scored, b: Scored) => b.score - a.score || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : 0);

export function mmr(scored: Scored[], k: number, opts: { requested: boolean; lambda?: number }): Scored[] {
  const lambda = opts.lambda ?? REC_CONFIG.mmr.lambda;
  const saturation = REC_CONFIG.mmr.saturation;
  const cuisineSim = REC_CONFIG.mmr.sim.cuisine * (opts.requested ? REC_CONFIG.mmr.requestedCuisineFactor : 1);
  const pool = [...scored].sort(byScore);
  const chosen: Scored[] = [];
  while (chosen.length < k && pool.length) {
    let best = 0;
    let bestV = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i].c;
      const pen = chosen.reduce((m, s) => Math.max(m, similarity(c, s.c, opts.requested)), 0);
      const same = c.cat.recCat ? chosen.filter((s) => s.c.cat.recCat === c.cat.recCat).length : 0;
      const v = pool[i].score - lambda * pen - saturation * Math.max(0, same - 1) * cuisineSim;
      if (v > bestV + 1e-12) { bestV = v; best = i; }
    }
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen;
}

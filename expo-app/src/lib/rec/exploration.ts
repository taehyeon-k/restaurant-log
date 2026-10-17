import { REC_CONFIG } from "./config";
import { byScore, marginalUtility } from "./mmr";
import type { Scored } from "./score";

export type ExplorationPolicy = {
  mode: "disabled" | "epsilon-last-slot-v1";
  epsilon: number;
  position: number | null;
  distribution: { key: string; probability: number }[];
  chosenKey: string | null;
  chosenProbability: number | null;
};

/** Reproducible uniform draw from an independently generated session seed. Not for security. */
function draw(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Only the fifth slot varies, among near-equal raw AND MMR scores. The first four stay fixed.
 * Probabilities are conditional on that prefix and this candidate pool, not exposure probabilities.
 */
export function exploreLastSlot(picks: Scored[], pool: Scored[], requested: boolean, seed?: string) {
  const disabled: ExplorationPolicy = { mode: "disabled", epsilon: 0, position: null, distribution: [], chosenKey: null, chosenProbability: null };
  if (!seed || picks.length !== REC_CONFIG.count) return { picks, policy: disabled };
  const cfg = REC_CONFIG.exploration;
  const prefix = picks.slice(0, -1);
  const incumbent = picks[picks.length - 1];
  const taken = new Set(prefix.map((s) => s.c.key));
  const u0 = marginalUtility(incumbent, prefix, { requested }).utility;
  const support = pool.filter((s) => !taken.has(s.c.key) &&
    (s.c.key === incumbent.c.key || (s.x.taste >= REC_CONFIG.novelty.tasteGate.lo &&
      Math.abs(s.score - incumbent.score) <= cfg.maxScoreGap &&
      Math.abs(marginalUtility(s, prefix, { requested }).utility - u0) <= cfg.maxScoreGap)))
    .sort(byScore);
  if (support.length < 2 || !support.some((s) => s.c.key === incumbent.c.key)) return { picks, policy: disabled };
  const distribution = support.map((s) => ({ key: s.c.key, probability: cfg.epsilon / support.length + (s.c.key === incumbent.c.key ? 1 - cfg.epsilon : 0) }));
  const random = draw(seed);
  let cumulative = 0, index = support.length - 1;
  for (let i = 0; i < distribution.length; i++) {
    cumulative += distribution[i].probability;
    if (random < cumulative) { index = i; break; }
  }
  const selected = support[index];
  return {
    picks: [...prefix, { ...selected, selection: marginalUtility(selected, prefix, { requested }) }],
    policy: {
      mode: "epsilon-last-slot-v1", epsilon: cfg.epsilon, position: picks.length, distribution,
      chosenKey: selected.c.key, chosenProbability: distribution[index].probability,
    } satisfies ExplorationPolicy,
  };
}

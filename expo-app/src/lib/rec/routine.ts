import type { Restaurant } from "../types";
import { REC_CONFIG } from "./config";
import { dayDiff } from "./time";

/** Only recent, repeated and positively rated/revisit-marked meals relax the default penalty.
 * Deduplicating dates prevents duplicate records or couple entries inflating confidence.
 */
export function routineMultiplier(rows: Restaurant[], today: string, ratingOf: (r: Restaurant) => number | null) {
  const cfg = REC_CONFIG.repetition.routine;
  const dates = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.visited_at) continue;
    const age = dayDiff(r.visited_at, today);
    if (age < 0 || age > cfg.windowDays) continue;
    const rating = ratingOf(r);
    const positive = rating != null ? rating >= 4 : r.revisit;
    // A low-rated meal on the same date prevents a positive duplicate masking it.
    dates.set(r.visited_at, (dates.get(r.visited_at) ?? true) && positive);
  }
  const sorted = [...dates].sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length < cfg.minDates) return 1;
  let repeats = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1][1] && sorted[i][1] && dayDiff(sorted[i - 1][0], sorted[i][0]) <= cfg.maxGapDays) repeats++;
  }
  return 1 - cfg.maxReduction * repeats / (cfg.kappa + sorted.length - 1);
}

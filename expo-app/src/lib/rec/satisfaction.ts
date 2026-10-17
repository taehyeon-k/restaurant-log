import type { Restaurant } from "../types";
import { REC_CONFIG } from "./config";
import { dayDiff } from "./time";

/** Satisfaction is neutral without evidence. Visit count alone never raises it. */
export function personalSatisfaction(rows: Restaurant[], today: string, ratingOf: (r: Restaurant) => number | null) {
  let weight = 0, sum = 0, rated = 0, positive = 0, revisitOnly = 0;
  for (const r of rows) {
    if (!r.visited_at) continue;
    const age = dayDiff(r.visited_at, today);
    if (age < 0) continue;
    const rating = ratingOf(r);
    if (rating == null && !r.revisit) continue;
    const w = Math.max(REC_CONFIG.taste.recencyFloor, Math.exp(-age / REC_CONFIG.taste.recencyTauDays)) * (rating == null ? 0.6 : 1);
    const value = rating != null ? (rating - 1) / 4 : 0.7;
    sum += w * value; weight += w;
    if (rating != null) { rated++; if (rating >= 4) positive++; }
    else revisitOnly++;
  }
  const k = REC_CONFIG.favorite.kappa;
  return { value: (k * 0.5 + sum) / (k + weight), confidence: weight / (k + weight), rated, positive, revisitOnly };
}

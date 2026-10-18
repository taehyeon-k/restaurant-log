import { REC_CONFIG } from "../rec/config";
/** Each contributor has one rating vote regardless of how often they post. */
export function communityEvidence(rows: { user_id: string; rating: number | null }[]) {
  const byUser = new Map<string, number[]>();
  for (const row of rows) {
    const values = byUser.get(row.user_id) ?? [];
    if (row.rating != null && Number.isFinite(Number(row.rating)) && Number(row.rating) >= 1 && Number(row.rating) <= 5) values.push(Number(row.rating));
    byUser.set(row.user_id, values);
  }
  const ratings = [...byUser.values()].filter((r) => r.length).map((r) => r.reduce((a, b) => a + b, 0) / r.length);
  const cfg = REC_CONFIG.taste;
  const average = (ratings.reduce((a, b) => a + b, 0) + cfg.ratingPriorN * cfg.ratingPrior) / (ratings.length + cfg.ratingPriorN);
  return { contributors: byUser.size, ratedContributors: ratings.length, average, popularity: Math.min(byUser.size, 10) * 0.2 };
}

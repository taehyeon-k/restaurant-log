import { compareRankers } from "../eval";
import { buildPool } from "../candidates";
import { buildContext, eligible, recommend } from "../pipeline";
import { score } from "../score";
import { benchmarkCases } from "./scenarios";
import { V3_BASELINE } from "./v3-baseline";

console.log("Synthetic calibration scenarios; these numbers do not measure user satisfaction or uplift.");
console.log(`Archived baseline: ${V3_BASELINE.version}, commit ${V3_BASELINE.commit}`);
for (const scenario of benchmarkCases()) {
  const ctx = buildContext(scenario.input);
  const all = buildPool({ ...scenario.input, radius: 3000 });
  const scored = all.filter((c) => eligible(c, scenario.input.filter)).map((c) => score(c, ctx));
  const previousKeys = V3_BASELINE.cases.find((c) => c.name === scenario.name)?.keys;
  const result = recommend(scenario.input);
  console.log(JSON.stringify({
    scenario: scenario.name,
    comparisons: compareRankers(scored, { previousKeys }),
    featureInfluence: result.diagnostics.ranking,
    displayed: result.picks.map((s) => ({ key: s.c.key, dish: s.c.cat.dish, taste: s.x.taste, satisfaction: s.x.favorite, repetition: s.repetition })),
  }));
}

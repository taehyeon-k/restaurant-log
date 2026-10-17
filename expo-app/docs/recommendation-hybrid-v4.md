# Recommendation improvements — hybrid-v4.0

Implemented in the Expo app on `feature/recommendation-v4`. This supersedes the
ranking described in [the historical v3 document](recommendation-hybrid-v3.md).
The existing retrieval APIs, diary tables, filters, and visual layout are reused.
No model training, new provider, schema change, production deployment, or live
traffic experiment is part of this change.

## 1. Evidence-backed explanations and diagnostics

Explanations require both a positive score contribution and supporting evidence:

- A cuisine/dish preference claim requires positive evidence from at least two
  distinct restaurants. Repeated visits to one restaurant do not become “N places.”
- Neutral and wishlist-only profiles never claim a proven taste match.
- Familiarity alone is not described as satisfaction. Good restaurant ratings or
  explicit revisit evidence are required for those explanations.
- Novelty says only that the restaurant is unvisited. No quality is invented.
- Meal activity explanations require a positive meal contribution; community
  repeat-visit evidence is described as observed revisiting, not a quality rating.
- Today activity and yesterday-comparison sentences were removed from ranking
  explanations because they were not independently scored contributions.

Every result retains feature scores, contributions, repetition, evidence strength,
base rank, and MMR penalty/utility. Evidence strength is a shrinkage ratio, not a
calibrated probability of satisfaction.

`rankingDiagnostics` calculates feature spread, group contributions, and the number
of top-five membership/position changes when each fixed feature contribution is
removed and MMR reruns. These ablations do not recompute dependent features (for
example, novelty's taste gate), and are diagnostics rather than causal attribution.

The four reporting groups are personal fit (taste), restaurant desirability
(wishlist/personal satisfaction/community), practicality (distance/meal/weather),
and discovery (novelty minus repetition). They expose the existing additive score,
without adding another layer of weights.

## 2. Recalibrated ranking, uncertainty, and repetition

All features remain in [0,1]. The initial v4 configuration is:

```
S = .36 T + .20 D + .12 W + .14 F + .08 Q + .06 M + .04 N
    - R_place - R_cuisine
```

| Feature | Definition | Neutral/default |
| --- | --- | --- |
| T | Hierarchical cuisine/dish preference | 0.5 |
| D | `exp(-max(0, distance_m-250)/tau)` | Computed distance |
| W | Wishlist membership in the active book | 0 |
| F | Smoothed personal restaurant satisfaction | 0.5 |
| Q | Existing Bayesian-smoothed community revisit evidence | 0.5 |
| M | Mean of user meal-slot fit and place activity | 0.5 without evidence |
| N | Existing gated novelty, with a smaller weight | No novelty for recent visits |

Wishlist/restaurant evidence gained influence and novelty lost influence. This
supports two explicit calibration judgments: an otherwise equal saved restaurant
at 800 m should beat an unknown one at 300 m; a consistently well-rated favorite
can beat an equally suitable unvisited place after a reasonable revisit gap.
These are product hypotheses, not empirically optimal weights.

Personal restaurant satisfaction is
`F=(1.5*.5 + sum(w*y))/(1.5+sum(w))`, with normalized rating `(rating-1)/4`, or a
weak 0.7 revisit signal at confidence 0.6 when unrated. Unrated/unmarked visits add
no satisfaction evidence. Recency weights use the existing 180-day decay and
0.25 floor. A low rating can reduce F below neutral; revisit=true never erases it.

Community evidence remains a smoothed repeat-visit signal, not a direct quality
measurement. Its evidence strength is `users/(users+3)`; absent data has strength
zero. The system cannot manufacture restaurant quality for unfamiliar Kakao places.

Repetition now uses:

```
R_place   = .16 * exp(-days_since_visit/3) * routine_multiplier(place)
R_cuisine = .08 * min(1, sum(exp(-days_since_meal/2))) * routine_multiplier(food_group)
```

Cuisine repetition uses distinct meal dates within seven days; duplicate diary
entries on a date do not multiply the penalty. Explicitly requested food groups
still avoid their cuisine repetition penalty.

Routine inference looks at at most the last 90 days. It requires three distinct
dates. An interval of at most 14 days counts as a positive recurrence only when
both meals are rated at least 4 or, if unrated, marked for revisiting. A low-rated
duplicate on the same day prevents a positive duplicate from masking it.

```
routine_multiplier = 1 - .65 * positive_intervals / (5 + distinct_dates - 1)
```

Sparse, unrated, poor, and old histories keep the default multiplier of 1. The
penalty is softened rather than eliminated. All routine evidence is book scoped.
This is a conservative heuristic; it is not yet a model of a user's ideal revisit
interval. In the synthetic “happy regular yesterday” case the restaurant still
does not enter the top five, which is an intentional remaining cooldown tradeoff.

Weather modifies distance tau only. The legacy context feature remains neutral
with weight zero for snapshot compatibility. Tau stays 900 m, multiplied by 0.7
in precipitation/extreme temperatures and by 0.85 at weekday lunch. Observations
more than two hours from the requested recommendation time, or invalid observation
timestamps, are ignored. Future meal selection does not treat today's conditions
as a forecast.

Place meal activity uses `max(slot_any,slot_dow)`, not their sum: same-weekday
activity is contained in all-weekday activity. Its value is
`.5 + .5*(1-exp(-activity/3))`; no observations means uncertainty, not negative fit.

## 3. Hierarchical taste

The legacy nine food-group filters remain supported. Alongside them,
`CategoryInfo` now holds independent `cuisine` and canonical `dish` attributes.
Japanese ramen can have cuisine 일식, dish 라멘, and legacy filter group 면.

Provider category paths and a small, explicit dish dictionary supply metadata.
Diary menu names take precedence over restaurant names when they identify one
dish. Multiple recognized dishes without specific votes do not inherit a single
dish preference from the restaurant rating. Unknown attributes remain unknown;
ingredients, specialties, prices, and hours are not guessed.

For rated meals:

```
y = .65*clamp((rating-1)/4)
  + .35*clamp(.5+(rating-user_mean)/4)
```

The user's mean is based on per-restaurant means, shrunk toward 3.5 with five
prior observations. This prevents one heavily repeated restaurant dominating the
rating baseline. Missing/unrated and revisit-only cuisine evidence retain the
existing weak signals.

Each restaurant's total evidence weight is capped at 1 for each preference
dimension. Repeated observations can refine its average but cannot stand in for
many distinct restaurants. Stable place IDs are preferred, then the existing
place key, then normalized name/address/location. Sparse or inconsistent identity
metadata can still imperfectly merge/split restaurants.

```
T_cuisine = (3*.5 + sum(capped_w*y)) / (3+sum(capped_w))
T_dish    = (2*T_cuisine + sum(capped_w*y)) / (2+sum(capped_w))
```

Known dish evidence selects T_dish; otherwise the system falls back to the cuisine
parent, then neutral. If cuisine is unknown, the legacy food group is the fallback.
Wishlist interest is reduced to weight .10 and capped at two wishes per food group
and cuisine. It does not create dish satisfaction evidence.

Recognized explicit menu votes are stronger evidence of that dish than the overall
restaurant rating: thumbs up/down map to .8/.2 with weight .6. They are aggregated
per dish per record and still subject to the restaurant cap. Thus a good restaurant
rating cannot turn a specifically disliked ramen dish into positive ramen evidence.

Couple note averaging and strict active-book isolation remain intact. Invalid
ratings and meals after the selected date do not enter taste evidence.

MMR compares independent cuisine/dish attributes where known. Fallback and cycled
selections now retain already chosen restaurants as the diversity context. Explicit
cuisine filters also match the cuisine attribute; exclusions win conflicting
include/exclude conditions (e.g. include noodles, exclude Japanese).

## 4. Baselines and outcomes

Run:

```sh
npm test
npm run typecheck
npm run eval:rec
```

`compareRankers` compares distance-only, the fixed `.22*D+.10*W` simple baseline,
v4+MMR, and optionally an archived previous slate on the same eligible pool.
The simple baseline deliberately keeps fixed weights to remain comparable across
future v4 changes. Only hybrid applies diversity reranking.

`__tests__/v3-baseline.ts` contains actual output of the original v3 implementation
at commit `a4497b76349a63aad28b3f5e47517fc1e549a6ca`, run in a temporary copy against
`__tests__/scenarios.ts`. Its scenario SHA-256 is recorded. It is not a recreation
of v3 using v4 features. Archived slates are evaluated with the current common
metadata for comparable distance/diversity summaries.

[The evaluation artifact](recommendation-v4-evaluation.json) contains five synthetic
calibration scenarios and feature diagnostics. Observed examples:

- Cold start: v3 and v4 select the same five. No new quality signal was invented.
- Menu-based sushi/ramen evidence: v3 includes the disliked ramen candidate; v4
  removes it from the top five and puts a sushi candidate first.
- The saved 800 m restaurant is absent from v3's top five and first in v4.
- Strong repeated satisfaction softens repetition, but yesterday's regular can
  still lose to other options. The separate reasonable-gap regression verifies
  that familiarity can win when the cooldown has decayed.

These are calibration examples, not user satisfaction results, NDCG gains, or
evidence of real-world uplift. `compareRankers` reports NDCG only when the selected
items have explicit judgments, otherwise null with judged coverage. An absent
judgment is not silently converted into a negative label. Even judged NDCG on
historical exposure logs can be biased; ordinary logs do not identify causal lift.

`outcomeSummary` accepts authorized normalized session/event exports, joined with
post-visit ratings by record ID. Per algorithm version it calculates exposed
sessions, verified-visit session rate, confirmed-save rate, refresh-without-choice
sessions, and mean observed post-visit rating. Repeated events do not inflate
session conversion or duplicate a rated record. Zero exposure yields null rates.
Clicks are not substituted for visits. Exposure-linked visits are associations,
not proof that a recommendation caused a visit.

For a live comparison: assign stable user-level baseline/v4 cohorts, retain diary
mode and cold-start slices, and compare visits plus observed satisfaction over a
predeclared measurement period. The local implementation does not assign live
cohorts or claim that this comparison has happened.

## 5. Controlled exploration, implemented but off

`REC_CONFIG.exploration.enabled` is false. The Expo screen passes no exploration
seed in normal use. Pure-function callers may opt in with `explorationSeed` for
tests/research. There is no randomization in default recommendations.

The research policy preserves the deterministic first four restaurants and uses
epsilon=.10 sampling for the fifth slot. Support is limited to eligible fresh
candidates within .02 of both the incumbent raw score and MMR utility; alternatives
below the taste gate are excluded. Cycled and long-distance fallback slates do not
explore. A seeded draw makes identical inputs reproducible.

For support size n, the incumbent has probability `1-epsilon+epsilon/n`, each other
supported option `epsilon/n`. The full distribution, chosen key/probability, policy
name, position, prefix features, and supported candidate snapshots are logged.
These are selection probabilities conditional on the prefix and pool, not the
probability the fifth card is actually seen. They do not permit unbiased evaluation
of arbitrary slates, other positions, or candidates outside this support.

Before enabling, verify authenticated writes and observed-card delivery on a real
device, inspect log completeness and failures, define the experiment and outcomes,
then make a separately versioned configuration change. A bandit or learned ranker
is not required to run this small experiment later.

## Logging compatibility and validation

Read-only SQL checks confirmed existing `rec_sessions.context` and
`rec_items.features` are JSONB; all three logging tables have RLS enabled with
owner INSERT/SELECT policies and no UPDATE policies. No production rows or schema
were changed. New fields use the existing JSON payloads, so no migration is needed.

The DB's `rec_items.rank` must be 1..100. It now stores the base rank capped at 100;
the uncensored value is `features.base_rank`. Display position is independent.
Use `features.base_rank` for future v4 analysis, not the capped compatibility column.

Sessions are immutable snapshots keyed by diary/context/features, not restaurant
names alone. This fixes stale logged contexts when a new book or new evidence
produces the same five restaurants. The screen also refreshes time context at date
or meal-period boundaries and constructs lunch/dinner selections explicitly in KST.

Concurrent writes coalesce, and only successful deliveries are cached. An item
write failure prevents subsequent impression submission for that attempt. Later
calls can retry, accepting duplicate immutable session/item inserts under the
existing primary keys. This is not a durable offline queue or exactly-once event
delivery: connection loss after a successful insert can still cause ambiguity.
That limitation is another reason exploration stays off.

Actual verification:

- `npm test`: 55 passed, 0 failed, including 4,000 seeded exploration draws,
  hierarchy, explicit menu votes, calibration, routine, book isolation, timestamp
  handling, snapshots, delivery retry/coalescing, and missing judgments.
- `npm run typecheck`: passed.
- `tsc -p tsconfig.test.json --noEmit --noUnusedLocals --noUnusedParameters`: passed.
- `npm run eval:rec`: passed; artifact generated from the final configuration.
- `CI=1 npm run lint`: blocked by the repository's missing `eslint` installation.
  No lint dependencies were added solely for this change.
- Authenticated mobile UI-to-database delivery was not exercised; RLS and payload
  compatibility were inspected read-only. No physical-device performance claim.

## Files and remaining limits

Ranking: `src/lib/rec/{config,categories,candidates,taste,score,mmr,pipeline}.ts`;
new `routine.ts`, `satisfaction.ts`, `exploration.ts`, `snapshot.ts`, `delivery.ts`;
evaluation in `eval.ts`. Integration: `app/(tabs)/recommend.tsx` and
`src/features/recommend/log.ts`. Tests/fixtures/benchmarks live in
`src/lib/rec/__tests__`; npm scripts are in `package.json`.

The dish dictionary is intentionally small and heuristic; unfamiliar and ambiguous
menu names remain unknown. Couple ratings still represent a shared average, not
individual veto/preferences. Community revisits reflect convenience and exposure
as well as satisfaction. Provider retrieval limits, missing hours/prices, location
accuracy, incomplete visit linking, and sparse community data remain. Better
restaurant quality needs genuine evidence, not another weight adjustment.

No UI design changes or preference questionnaires were added. There is no claim
that 0.36 is an optimal taste weight or that these heuristics generalize beyond
the checked scenarios. Use launch observations to decide the next change.

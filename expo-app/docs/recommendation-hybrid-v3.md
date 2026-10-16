# 「지금 뭐 먹지」 hybrid-v3 — non-AI recommendation pipeline

Spec: `expo-app/recommendation-non-ai-pipeline.md`. Config version: `REC_CONFIG.version` = **hybrid-v3.1** (`src/lib/rec/config.ts`).
This version replaces v2 `pickNow`, a staged filter plus a hand-tuned point sum in `src/lib/recommend.ts`.
PR #6 (`feature/what-to-eat-v1`) was never merged and was written against the pre-v2 tab. This work keeps its useful parts: the Kakao FD6 server route, the Bayesian/MMR idea, and the analytics design.

## 1. Architecture

```
recommend.tsx (tab)
 ├─ useRecPlaces      → rec_places RPC (Dinary verified-visit aggregates, 10 km, existing)
 ├─ useRecCandidates  → /api/recommend/candidates (Kakao FD6, 1.5 km → 3 km)   [web, new]
 ├─ useRecWeather     → /api/weather (KMA 초단기실황; null when unavailable)   [web, new]
 └─ lib/rec/pipeline.recommend(input)             pure, deterministic
      A  candidates.buildPool   merge kakao + community + my records + my wishes, dedupe, attach history
      B  score.score            features → weighted sum − repetition, components kept, explanations
      C  mmr.mmr                greedy MMR + cuisine saturation, avoid list for 「다시 추천」
 NowMode.tsx  → cards, impressions (700 ms dwell), actions → features/recommend/log.ts → rec_* tables
```

Modules are separated, so the ranker in `score.ts` can later be swapped for a learned model without touching retrieval or re-ranking.

## 2. Stage A — candidate generation

* **Kakao FD6** (server only; the key never ships in the app). One query per request is limited to 45 results, and distance order clusters them in a couple of buildings. The route therefore merges the distance-sorted circle (3 pages) with a **3×3 rect partition** (2 pages each, stopping at `is_end`). Results are clipped to the circle and deduplicated by Kakao id.
  Real check (성수역, a public landmark, 2026-10-16): **283 unique places in 1.5 km, 757 ms, median 799 m / p90 1.29 km.** The 3 km result is merged with the 1.5 km one, because 3 km cells are sparse near the centre.
* **community** — `rec_places` (Dinary verified visits, ≥3 users, counts only).
* **history / wish** — the active book's own records and wishes.
* **Dedup:** same Kakao id (`place_url` → id) **or** same normalized name within 100 m. The same name further away counts as a different branch. `chainOf` strips branch suffixes (「…점」) for MMR chain detection.
* **Eligibility (hard):** meal places only. Kakao `술집`, `간식`, `카페` and cafe-kind records are excluded, as are explicit 먹고 싶은 것 / 빼고 싶은 것 choices. No "open now" claim is made; there's no hours data.
* **Radius:** 1.5 km. If fewer than 15 eligible candidates are found, it expands to 3 km (`wantRadius` asks the tab to fetch Kakao 3 km). If fewer than 5 picks result, it fills from my wishes and places visited on 2 or more days within 10 km (existing v2 behaviour).
* **Fallbacks:** if Kakao fails (including when the route isn't deployed yet), Dinary data alone is used and the card shows a note. If location is denied, the existing 「자주 기록한 동네」 fallback and manual point picker are used.

## 3. Stage B — scoring

All features are in [0,1]. Missing data gets the neutral value, so it doesn't move the ranking.

```
S(u,r,c) = 0.32·T + 0.22·D + 0.10·W + 0.08·F + 0.09·Q + 0.07·M + 0.07·N + 0.05·C − R_place − R_cuisine
```

| key | meaning | formula | neutral |
|---|---|---|---|
| T taste | Bayesian cuisine preference | `(κμ0 + Σwᵢyᵢ)/(κ + Σwᵢ)`, κ=3, μ0=0.5 | 0.5 |
| D distance | straight-line decay with comfort radius | `exp(−max(0, d−250)/τ)`, τ=900 m (×0.7 bad weather, ×0.85 weekday lunch) | — |
| W wish | on this book's wishlist | 1/0 | 0 |
| F favorite | satisfaction at this place | `Σ sᵢ/(1.5 + n)`; sᵢ = rating/(revisit) signal | 0 |
| Q community | Dinary revisit rate, shrunk | `((n·rate + 3·0.3)/(n+3))/0.6` | 0.5 |
| M meal | this slot fits | mean of user slot-lift `lift/(1+lift)` and place slot activity | 0.5 |
| N novelty | unvisited × taste gate | `{1, 0.4 if last visit >90 d, else 0} · clamp((T−0.42)/0.18)` | 0 |
| C context | weather × distance | bad weather (precip, ≤−5 °C, ≥31 °C): `exp(−d/400)` | 0.5 |
| R_place | revisit too soon | `0.22·exp(−Δt/6 d)` | 0 |
| R_cuisine | same cuisine recently | `0.12·min(1, Σ exp(−Δtᵢ/2 d))` over 7 days; 0 if user asked for it | 0 |

**Taste signal yᵢ.** A rating is compared with the user's own shrunk mean rating (prior 3.5, n=5): `y = 0.5 + (rating − mean)/4`. A generous rater's cuisines are therefore not all "loved", and frequency is not treated as satisfaction.
- Unrated with 「다시 갈래요」: y=0.70, weight 0.6.
- Unrated otherwise: y=0.54, weight 0.3. This is uncertain, nearly neutral evidence.
- `revisit=false` is not read as dislike.
- Wishes add a weak interest signal: y=0.65, w=0.25, at most 3 per cuisine.

**Weight wᵢ.** `max(0.25, exp(−age/180 d)) × (verified ? 1 : 0.8)`.

**Meal slot.** Uses only `verified_at` (server time). `visited_at` is a date and is not used for time of day.

**Couple books.** Only the active book's rows and wishes are used (`bookScoped`, strict `book_id`). A rating is the mean of both members' `record_notes`, which represents shared taste. The personal book never mixes in.

**Explanations.** Built from the components that actually raised the score (`w·(x−neutral)`), at most 3. No percentages or "match probability" are shown, because the score is uncalibrated.

**Why the weights changed from the spec's starting point:**
- Q (Dinary revisit rate) was added, because it's the only quality signal Kakao lacks.
- D gained a comfort radius. With pure `exp(−d/700)` on real 성수 data, **85% of score spread came from distance and all five picks were within 84 m.**
- After the change, the top-20 spread is driven by taste and novelty, and picks span 84–240 m.

## 4. Stage C — MMR

```
r* = argmax_{r∉S} [ S(r) − λ·max_{j∈S} Sim(r,j) − λc·max(0, n_c(S) − 1)·w_cuisine ]
Sim = 1 if same chain, else 0.4·same cuisine + 0.15·same sub-category + 0.1·same price (both known) + 0.35·exp(−dist/150 m)
λ = 0.12, λc = 0.12; cuisine terms ×0.15 when the user picked 먹고 싶은 것.
```

The saturation term is an extension to plain MMR. With `max` alone, either a second same-cuisine place never appears (λ large) or all five can be one cuisine (λ small). The test fixes the target: a clear preference gets 2–3 of 5.

**「다시 추천」** passes all previously shown keys as `avoid`, which gives the next-best diverse five with zero overlap. When the pool is exhausted it re-uses earlier ones and says so (`cycled`). Results are deterministic: sorting is score then key, there's no randomness, and input order doesn't matter.

## 5. Logging (`supabase/migrations/20261017000300_recommendation_logging.sql`, applied 2026-10-16)

| table | written when | contents |
|---|---|---|
| `rec_sessions` | first impression of a pick set | algo_version, context (slot, dow, date, radius, relax, filter, weather bucket, area name, refresh #, pool sizes) |
| `rec_items` | same time | shown 5 (position 1–5) + top-20 ranked (position null): kakao_id, category, distance_m, score, feature snapshot, sources |
| `rec_events` | user actions | `impression` (card visible ≥700 ms while tab focused), `kakao_open`, `detail_open`, `wish_start` (form opened), `wish_saved` (insert succeeded), `navigate` (여기로 갈게요), `visit_confirmed` (record saved for a shown place within 12 h; `payload.via` = navigate/shown, `verified`, `record_id`), `refresh` |

* **Not stored:** raw coordinates (the area name and per-item distance only), Kakao names and addresses (id only), and record text. Satisfaction is joined later through `record_id → restaurants.rating` / `record_notes`.
* **RLS:** users insert and select only their own rows. Insert of a session requires membership of `book_id`. Item and event inserts require the session to be the user's own. `record_id` must be the user's own record, and `wish_id` must be visible to the user. There are no update or delete policies, so the tables are append-only. Logs cascade on account deletion.
* **Deploy:** applied to production on 2026-10-16 via the Supabase connector (RLS on, 2 policies per table, no anon access). To re-apply elsewhere, use the project's usual migration process (`npm run db:run -- supabase/migrations/20261017000300_recommendation_logging.sql` from the repo root, or the Supabase SQL editor). The app tolerates the tables being absent; writes fail silently, with a dev-only console warning.

## 6. Future learning-to-rank

* **Training row:** `(session, candidate_key)` from `rec_items`, with features from the snapshot and the context from `rec_sessions`.
* **Labels from `rec_events`:** visit_confirmed (verified) 4 > visit (unverified) 3 > wish_saved 2 > navigate / kakao_open / detail_open 1 > impression only 0. **Only impressed items** should be labelled 0. Unseen ranks (position null, or never impressed) are *unlabelled*, not negatives.
* **Position bias:** cards are seen sequentially in a pager, so the impression logs give per-position exposure. Use them for inverse-propensity weighting, or for a randomized-swap experiment before trusting clicks.
* **Offline evaluation:** replay the logged sessions, re-score them with a candidate model, and compute `eval.ndcgAt` on impressed items. LambdaMART (LightGBM `lambdarank`) can use the same features plus learned interactions.
* **Online:** recommendation→visit conversion = sessions with `visit_confirmed` / sessions with ≥1 impression, sliced by `algo_version`.

## 7. Tests (`npm test` in expo-app — node:test, no new deps)

31 tests cover:
- Bayesian shrinkage, low-rating cuisines, cold start, unrated / sparse visits, recency
- book isolation and couple note averaging
- distance monotonicity (non-increasing, strictly decreasing beyond the comfort radius), and distance not overturning a large taste gap
- recent-cuisine soft penalty, no penalty for a requested cuisine, place repetition decay
- wish boost and the novelty gate
- explicit exclusion and inclusion, non-meal exclusion, Kakao and Dinary dedup and branches
- MMR diversity, saturation (2–3 of a liked cuisine), requested-cuisine similarity, chain duplication
- determinism and order independence, refresh with no overlap, refresh cycling
- missing and rainy weather
- radius expansion, Kakao-down fallback
- eval utilities, and a simulated scenario

The simulated users are synthetic and say nothing about real performance.

**Real-candidate diagnostic** (Kakao data for 성수역, synthetic users; not a user outcome):

| synthetic user | Diversity@5 | distance p50 / max | cuisines | refresh overlap |
|---|---|---|---|---|
| cold start | 0.91 | 120 / 224 m | 5 different | 0 |
| likes 일식, ate 한식 yesterday | 0.86 | 105 / 237 m | 일식×2 + 3 others | 0 |
| rates every 한식 4–4.5 | 0.91 | 120 / 241 m | 5 different | 0 |

## 8. Known limitations

* **Weather needs `KMA_SERVICE_KEY`** (공공데이터포털 기상청 단기예보 조회서비스) wherever `/api/weather` runs. Without it, or when KMA fails, the route returns `weather: null` and the features stay neutral. The grid conversion was verified (Seoul 60,127 · Busan 98,76 · Jeju 53,38). Live call verified on 2026-10-16 21:00 KST (성수 19.6 °C, 부산 17.3 °C, no precipitation). The first attempt that day got `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` (403); a newly issued key needs time to activate. The key must also be set wherever `/api/weather` runs (the web server env), not only in the app `.env`.
* **Cold start in a dense area:** Kakao gives no quality signal, so ties within the comfort radius are broken by Kakao id. That ordering is deterministic but arbitrary, and diversity is preserved. Dinary community stats fix this where they exist.
* **No hours, prices or menus from Kakao.** The price similarity term only works for places in the user's own records.
* **Kakao terms:** the route keeps a 10-minute in-memory cache of complete results and stores nothing in the DB. The logs keep only Kakao place ids. Check the current Kakao Local API terms before broad release, and add server rate limiting per user.
* **Unverified visit linking** relies on name + 100 m. Offline-queued captures are not linked (no record id until upload).
* The web routes were type-checked against a stub `next/server`, not the web project's own toolchain, whose node_modules aren't installed in the codespace. Run `npm run build` at the repo root before deploying.

# Dinary — 지금 뭐 먹지? (hybrid-v1)

## Scope

Adds five nearby food-restaurant suggestions in the existing Expo recommendation tab, without replacing the previous recent-meals and wishlist sections.

1. Candidate retrieval: `GET /api/recommend/candidates?lat=...&lng=...&radius=1500`, authenticated through the existing Next.js `src/proxy.ts`. Uses the server-only `KAKAO_REST_API_KEY` and Kakao FD6 category search (distance + accuracy ordering). Existing `/api/geocode` behavior is unchanged.
2. Personalization: the selected personal/couple book's completed visit history, rating, re-visit intent, time context where available, and wishlist. Unrated meals provide weak neutral evidence; recently visited restaurants are penalized, not always blocked.
3. Ranking: interpretable weighted heuristic with Bayesian-shrunk cuisine preference, distance decay, wishlist boost, recency, meal preference, and a diversity-aware greedy re-ranker. An optional weather input is part of the ranker but **no weather provider has been connected yet**.
4. Five recommendations: each card opens Kakao Map and can open or create a wishlist entry. Refresh rotates an exploration suggestion.
5. Measurement: a new `recommendation_events` migration records impressions, Kakao Map openings, and **wishlist form starts**. A wishlist form start must not be treated as a completed save. No raw user coordinates are stored in the event table. Failed analytics writes never block the UI.

## Files

- `src/app/api/recommend/candidates/route.ts`
- `expo-app/src/lib/recommendRank.ts`
- `expo-app/src/lib/recommendCandidates.ts`
- `expo-app/app/(tabs)/recommend.tsx`
- `supabase/migrations/20261016000500_recommendation_events.sql`

## Deployment order

1. Review the RLS policies. Apply the migration through the project's established Supabase migration process.
2. Deploy the Next.js API route to the configured `EXPO_PUBLIC_API_BASE_URL` server. Verify `KAKAO_REST_API_KEY` remains server-only.
3. Build/test Expo in a development build with a valid session.
4. Test coordinates in Seoul and outside Seoul: this route uses Kakao search nationwide, rather than the existing Seoul-only `public_stores` table.

## Acceptance tests

- Signed-in current location: five or fewer real Kakao FD6 candidates within the configured radius (never fabricated opening times).
- Permission denied: user can choose a neighborhood; no hard crash.
- Selection of an existing saved neighborhood: reuse diary/wishlist coordinates when available.
- Lunch/dinner switching re-ranks without unnecessary provider searches.
- Recent-meals exclusion chips apply to the new recommendations.
- Wishlist-linked restaurant: displays `담김`; another restaurant opens pre-filled wishlist form.
- `다시 추천`: replaces the exploration slot when additional candidates exist.
- Duplicate business IDs do not appear; the original wishlist section still works.
- Two accounts/diaries: history and analytics do not leak between users (RLS).
- API failure and missing location show useful fallback messages.
- Impression logs include positions 1–5. Wishlist form opening logs `wish_start`, not a completed save.

## Known limitations & next priorities

- **Weather not active**: choose a licensed weather provider and add server-side caching before feeding `context.weather`. Open-Meteo's free endpoint is for noncommercial usage; verify licensing before production use.
- **Opening hours unavailable** from the current candidate payload; do not label restaurants as open.
- **Unverified real visits** may still be weak signals; current verification helps improve weighting.
- **No dish-level attributes** in provider payload. Add category enrichment from menus, logs and manually confirmed dish tags. Do not automatically infer dishes from broad categories.
- **Candidate source bias**: Kakao category queries return incomplete/ranked subsets, not every restaurant. Validate coverage and diversity.
- **Analytics**: actual wish completion and confirmed recommended restaurant visits need joins/instrumentation in the save flows. Historical recommendation exposure logging alone cannot produce unbiased negative labels.
- **Privacy/cost**: approximate coordinates are sent to Kakao for location search; document this in privacy disclosures, add server throttling/quotas and short-term spatial caching before broad release.
- **No CI or device build was run here.** Run `cd expo-app && npm run typecheck` and test the deployed Next.js route with an authorized session.

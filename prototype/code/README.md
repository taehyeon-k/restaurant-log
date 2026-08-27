# Next.js implementation of the design

Drop-in files for `taehyeon-k/restaurant-log@main` (Next 16 App Router, Tailwind v4, Supabase). Paths here mirror repo paths.

## Order of operations

1. Run `supabase/migrations/002_search_and_map.sql` in the Supabase SQL editor. Adds `kind`, `keywords text[]`, `lat`, `lng`, `photo_url`, indexes, and a `restaurant_keyword_facets` view.
2. Run `supabase/migrations/004_storage.sql` in the Supabase SQL editor. It creates the public `restaurant-photos` bucket and an INSERT policy so the current browser client can upload photos.
3. Copy the files below over the repo. `src/lib/supabase.ts` is unchanged and stays as-is.

```
src/app/globals.css              replaces  (design tokens + fonts)
src/app/layout.tsx               replaces  (Gowun Batang / Noto Sans KR / JetBrains Mono)
src/app/page.tsx                 replaces  (two-pane map + search)
src/app/add/page.tsx             replaces  (form in the design language)
src/app/_components/*.tsx        new
src/lib/types.ts                 new
src/lib/queries.ts               new
src/lib/useSearchState.ts        new
```

## How search works

Search state is URL state, so results are shareable and `page.tsx` stays a server component:

```
/?kind=restaurant&q=냉면&category=한식&region=중구&keyword=가성비&sort=rating&id=12
```

- `page.tsx` parses those params, calls `searchRestaurants()` + `getFacets()` in parallel, and passes rows down.
- `useSearchState()` is the only writer. Every filter change drops `id` (so a filtered-out row can't stay open) and `replace`s the URL with `scroll: false`.
- Chip options come from `getFacets()` — the actual distinct values in your data, not a hardcoded list. `src/lib/types.ts` keeps hardcoded `CATEGORIES`/`KEYWORDS` only for the `/add` form, where nothing exists to derive from yet.
- The text query is one Supabase `.or()` of `ilike` clauses across name/region/category/menu/review. Keywords use `.overlaps()` against the `text[]` column (GIN-indexed).
- `SearchBar` debounces 250ms.

`Workspace.tsx` is the client boundary. It holds the single non-URL piece of state — which pin/row is hovered — via context, so hovering a result highlights its pin and vice versa. Server-rendered nodes (brand, filters, sort row) pass through it as props.

The right pane switches on `?id`: absent → `ResultList`, present → `DetailPane`. Both panes share one scroll container per side; the page itself never scrolls (`overflow-hidden` on `body`).

## The map is still a placeholder

`MapPane.tsx` draws a stylized plate — grid, roads, parks — and projects `lat`/`lng` linearly onto it over a Seoul bounding box. Rows without coordinates get a stable scattered position so nothing disappears.

To make it real: replace the backdrop divs with a Kakao or Naver map instance (better Korean address coverage than Google), and render the pin buttons as custom overlays. The pin markup, the active/inactive styling, and the hover link to the list don't change. You'll also want geocoding on save in `/add` to fill `lat`/`lng` from the address field.

## Not addressed

- **Auth.** Every row is public and anyone with the anon key can insert. The photo upload policy is intentionally public for now as well. A personal log wants `user_id uuid references auth.users` + RLS policies before it goes anywhere real.
- **`/restaurant/[id]` and `/edit`.** Still your existing pages. `DetailPane` covers the read view inside the two-pane layout; the standalone route is now mainly a deep-link target. Edit links point at `/restaurant/[id]/edit` unchanged.
- **Pagination.** Fine for a few hundred rows; add `.range()` when it isn't.

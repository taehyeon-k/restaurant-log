You are working on the current GitHub repository:

`taehyeon-k/restaurant-log`

Goal:
Replace the current Leaflet + Carto/OpenStreetMap map implementation with Naver Dynamic Map, while preserving all existing map behavior, custom teardrop markers, search behavior, selected/hover states, and location picking.

Important constraints:
- Do NOT modify the existing Kakao place/address search API unless absolutely necessary.
- Keep `src/app/api/geocode/route.ts` using Kakao.
- The visible basemap should become Naver Maps.
- Do NOT expose or use the Naver Client Secret in frontend code.
- The browser-side map must use only:
  `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
- The Naver Maps JavaScript SDK must be loaded using the current parameter:
  `ncpKeyId`
- Preserve current UI/design as closely as possible.
- Do not redesign the website.
- Do not remove existing behavior unless it is technically impossible.
- Before changing anything, inspect the current repository carefully.

Current architecture:
- Main map: `src/app/_components/MapPane.tsx`
- Add/edit location map: `src/app/_components/LocationPickerMap.tsx`
- Custom teardrop marker implementation: `src/app/_components/mapPin.ts`
- Global Leaflet CSS: `src/app/globals.css`
- Kakao geocoding/place search: `src/app/api/geocode/route.ts`
- Current map library dependency: `leaflet`
- Framework: Next.js 16 + React 19 + TypeScript

The current map implementation uses Leaflet and this tile source:

`https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png`

This must be removed and replaced with Naver Dynamic Map.

Please implement the migration in the following way.

## 1. Add Naver Maps TypeScript definitions

Install:

`@types/navermaps`

Update both `package.json` and `package-lock.json`.

## 2. Create a reusable Naver Maps SDK loader

Create:

`src/lib/loadNaverMaps.ts`

Requirements:
- Client-side only.
- Use `process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`.
- Trim the value.
- Do not use the Client Secret.
- Avoid loading the SDK more than once.
- Return a Promise that resolves when `naver.maps` is available.
- Load:

`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=<CLIENT_ID>`

- Add clear error handling for:
  - missing environment variable
  - script loading failure
  - SDK loaded but `naver.maps` unavailable

## 3. Replace the Leaflet implementation in `MapPane.tsx`

Convert the main map to:

`new naver.maps.Map(...)`

Preserve these existing behaviors:

### Initial state
- Seoul center:
  - lat: `37.5665`
  - lng: `126.978`
- Initial zoom approximately equivalent to current zoom 12.
- Disable keyboard shortcuts.
- Put zoom controls at bottom-right.

### Restaurant markers
For every place with non-null latitude/longitude:
- show the existing custom teardrop-style marker
- preserve category color
- preserve revisit styling
- preserve marker label
- show restaurant name
- show rating
- keep click navigation behavior:
  - one visit:
    `/?rid=<id>`
  - multiple visits:
    `/?place=<encoded place key>`

### Hover and selected state
Preserve existing behavior:
- hover marker when corresponding list item is hovered
- enlarge/activate marker
- higher z-index when active
- reset when mouse leaves

### Search result / ghost marker
Preserve existing `usePlace()` behavior.

When a searched place is selected:
- show a ghost/dashed marker
- show the place name
- show:
  `+ 여기에 기록 추가`
- clicking it should navigate to:

`/add?name=...&address=...&lat=...&lng=...`

- move the map to the selected place
- use approximately zoom 16

### Selected restaurant
If `selectedKey` is set:
- move map to the selected restaurant
- approximately zoom 15

### Automatic fitting
If no search place is active:
- one visible location:
  move to that point
- multiple visible locations:
  fit all visible locations into bounds
- preserve reasonable padding
- do not zoom closer than approximately 15 during fit

### "이 지역에서 다시 검색"
Preserve the button and its styling.

When clicked:
- read current Naver map bounds
- extract southwest and northeast coordinates
- store bbox in the same format currently used:

`south,west,north,east`

with 5 decimal places.

Do not alter how `useSearchState()` works.

## 4. Convert `mapPin.ts` from Leaflet icons to Naver HTML markers

The current file is Leaflet-specific and uses:
- `DivIcon`
- `L.divIcon`
- Leaflet marker DOM access

Replace this with Naver-compatible marker icons using HTML content.

Use `naver.maps.HtmlIcon` / marker `icon.content`.

Preserve the current visual design:
- 24 px teardrop marker
- active marker around 32 px
- same category colors
- same revisit vs non-revisit fill/stroke logic
- same center dot
- same shadow
- same overall anchor at the tip of the pin
- same active enlargement behavior
- higher z-index when active

Current category colors must remain:

- 한식: `#b4552d`
- 중식: `#9a4a52`
- 일식: `#5f7a8a`
- 양식: `#7a6a9a`
- 아시안: `#6f8455`
- 분식: `#c07a2e`
- 커피: `#7a5c42`
- 디저트: `#b06a86`
- 베이커리: `#a8853f`
- 차: `#4f7a6a`
- fallback: `#8a8377`

For revisit:
- fill = category color
- stroke = paper color `#fbfaf6`
- core = paper color

For non-revisit:
- fill = paper color `#fbfaf6`
- stroke = category color
- core = category color

Preserve the label styling as closely as possible:
- paper/card background
- border
- rounded shape
- small shadow
- restaurant name
- rating
- optional CTA for ghost markers

HTML content must escape user-controlled restaurant/place names to avoid injecting raw HTML.

Expose helpers equivalent to:
- `pinIcon(...)`
- `ghostIcon(...)`
- `applyActive(...)`

but implemented for Naver markers.

## 5. Replace Leaflet implementation in `LocationPickerMap.tsx`

Convert the location picker map to Naver Maps.

Preserve all existing behavior:

- initial Seoul center
- initial zoom around 13
- zoom controls bottom-right
- keyboard shortcuts disabled

When user clicks map:
- obtain clicked coordinate
- call:
  `onChange(lat, lng)`

When `center` exists:
- show custom teardrop marker
- update marker position when center changes
- update marker appearance when category/revisit changes

When center changes:
- if current zoom is less than 15, move to approximately zoom 16
- otherwise pan to the coordinate

When center becomes null:
- remove marker

Clean up map and marker correctly on component unmount.

## 6. Remove Leaflet dependencies after migration

After all map files no longer import Leaflet:

Remove:
- `leaflet`
- `@types/leaflet`

Do not remove anything still required elsewhere in the repository without checking first.

## 7. Clean up Leaflet CSS

In:

`src/app/globals.css`

Remove:

`@import "leaflet/dist/leaflet.css";`

Remove Leaflet-specific rules if they are no longer used, including things such as:
- `.leaflet-container`
- `.leaflet-control-zoom`
- `.leaflet-control-attribution`
- `.paper-tiles`

Do NOT remove general website styles.

If the custom marker/label requires CSS, either:
- retain generic marker classes, or
- move styling into Naver HTML marker content

Prefer minimal changes.

## 8. Do not change Kakao search

Do not migrate:

`src/app/api/geocode/route.ts`

It should continue using:

`KAKAO_REST_API_KEY`

The intended architecture after this task is:

Visible map:
Naver Dynamic Map

Place/address search:
Kakao Local API

Database:
unchanged

## 9. Environment variable assumptions

The code must expect:

`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`

Do not hardcode credentials.

Do not use:

`NEXT_PUBLIC_NAVER_MAP_CLIENT_SECRET`

Do not add the Naver secret anywhere in browser code.

If server-side Naver REST APIs are not used in this task, do not introduce any secret-related environment variables.

## 10. Verify TypeScript/API compatibility carefully

Use the actual API provided by the installed `@types/navermaps`.

Do not blindly assume a method exists.

Check types for things such as:
- `naver.maps.Map`
- `naver.maps.Marker`
- `naver.maps.LatLng`
- `naver.maps.LatLngBounds`
- `naver.maps.Event`
- click event coordinate type
- marker icon type
- map bounds APIs
- fitBounds
- panTo
- zoom APIs
- map cleanup/destruction

If one of the proposed APIs differs from the type definitions, use the correct Naver API instead.

## 11. Build validation

After implementation, run:

`npm run build`

Fix all:
- TypeScript errors
- lint/compiler errors
- incorrect Naver types
- stale Leaflet imports
- unused imports
- references to removed Leaflet functions

Do not stop at the first build failure.

Keep fixing until the production build succeeds.

Then also search the repository for remaining Leaflet references:

Search for:
- `leaflet`
- `L.map`
- `L.marker`
- `L.tileLayer`
- `DivIcon`
- `LeafletMap`
- `paper-tiles`
- `leaflet-container`

Make sure no accidental Leaflet runtime dependency remains in the active application.

## 12. Do not make unrelated changes

Do not modify:
- Supabase logic
- restaurant database schema
- search logic
- filtering
- record forms
- page layout
- mobile layout
- detail panes
- authentication
- API behavior unrelated to maps

Keep this task strictly scoped to replacing Leaflet/Carto with Naver Maps.

## 13. Final report

After implementation, give me a concise report containing:

1. Files changed
2. Files added
3. Packages added/removed
4. Whether `npm run build` succeeded
5. Any remaining warnings
6. The exact Vercel environment variable I need:
   `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
7. Any Naver Cloud console configuration I still need to verify
8. Any behavior that could not be preserved exactly
9. The final Git diff summary

Do not commit or push until the code builds successfully.

If the implementation requires adapting the marker implementation because Naver handles HTML markers differently from Leaflet, preserve the existing appearance and behavior as closely as possible rather than simplifying the UI.
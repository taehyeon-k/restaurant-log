# design-sync notes — expo-app (DINARY mobile)

Target project: `DINARY Mobile` (claude.ai/design project `8fe27e04-e09e-419d-a0c5-699d276551e8`).

## How this repo is synced (shape: package, synthesized dist)

The app is React Native (Expo), not a web package, so the converter can't read it directly.
`.design-sync/build-dist.mjs` makes a browser-ready "published package" first:

1. esbuild bundles `design-sync-entry/index.ts` → `ds-dist/index.js` (ESM), aliasing
   `react-native` → `react-native-web` (installed in `.ds-sync/`), stubbing `expo-router` /
   `expo-haptics`, resolving `@/` via tsconfig, inlining images as data URLs.
2. `tsc` emits `.d.ts` into `ds-dist/types/`; `ds-dist/index.d.ts` lists the exports **explicitly**
   (the converter does not follow `export *`).
3. `ds-dist/package.json` names it `dinary-expo`; it is symlinked into `.ds-sync/node_modules/dinary-expo`.
4. `.design-sync/styles.css` (tokens + `@font-face`) and the 5 font `.ttf`s (copied from
   `node_modules/@expo-google-fonts/*`, ~26MB, never committed) are copied into `ds-dist/`.

Re-sync (from `expo-app/`):

```sh
# one-time per clone: cp the staged scripts (see skill step 7), then
(cd .ds-sync && npm i esbuild ts-morph @types/react react-native-web@~0.21 react@19.2.3 react-dom@19.2.3 playwright)
node .design-sync/build-dist.mjs        # MUST re-run after any `npm i` in .ds-sync — npm prunes the dinary-expo symlink
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules .ds-sync/node_modules --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

## Gotchas

- Converter dirs are non-dot on purpose: it skips dot-prefixed folders when scanning `.d.ts`, so entry/dist live in `design-sync-entry/` and `ds-dist/`.
- `cssEntry` / fonts resolve relative to the *package* (`ds-dist/`), not the repo.
- Playwright's Chromium needed `sudo npx playwright install-deps chromium` (system libs) on this machine.
- `SafeAreaProvider` is exported from the entry only so `cfg.provider` can wrap previews; it is excluded from the component list via `componentSrcMap`.
- `ScreenHead`, `BottomSheetModal`, `Placeholder` need the provider or they render blank.
- Single-element previews (`Chip`, `MobileStars`) are wrapped in `inline-flex`; without it they stretch to the card width and `MobileStars` partial fill stops clipping.
- `TabBar` is only used inside the screen frames (`Tabbed` in `design-sync-entry/screens.tsx`); `PaperMap` is replaced by a stand-in map.

## Screens (real code + sample data)

`design-sync-entry/screens.tsx` bundles the app's actual `app/**` screens. `AppScreen` wraps each in a 390×844 frame with a seeded React Query cache
(`mock-data.ts`: 10 records incl. a draft and a from-wish one, 4 wishes, 1 account), a route-params context, and safe-area insets 47/34.
Browser stand-ins for everything device/network related:

- `design-sync-entry/stubs/`: `expo-router` (params via `RouteContext`), `@/lib/supabase` (always-empty success), `naver-map` (paper-tone fake map that projects the real marker views by lat/lng at the given zoom/padding), `gorhom-bottom-sheet` (fixed sheet at the first snap point).
- `.design-sync/native-stubs.mjs`: location, camera, image-picker, notifications, sqlite, netinfo, task-manager, file-system, haptics, gesture-handler, linking/web-browser, datetimepicker, plus the app's own `queue/*`, `geofence`, `api`, `photos`, `geocode` (sample Seoul places). `useQueue` must return an **array** (drafts screen maps over it).
- `build-dist.mjs` defines `process.env.EXPO_OS="web"` and blank `EXPO_PUBLIC_*` (no keys/URLs in the bundle).
- Bundle-time web patch of `src/components/ui.tsx`: `MobileStars` overlay text drops `numberOfLines={1}` (react-native-web adds `max-width:100%` + ellipsis, which truncated partial stars). Prints `[web-patches]` if the pattern stops matching.
- `AppScreen` overrides `Dimensions.get` to 390×844 (RNW forbids `Dimensions.set`) so record-detail's full-width hero fits the frame.
- Photos are base64 SVG data URIs — RNW's `Image` did not render `data:image/svg+xml;utf8,…`.
- `WishDetailScreen` renders over `MapTab` because the app shows it as a transparent modal.
- Screen cards use `cardMode: column` + `viewport: 430x900`.

## Known render warns (benign — screenshots checked)

- `[RENDER_THIN]` on all SVG-only icons (BellIcon, BookmarkIcon, BurstIcon, CalendarIcon, CameraIcon, DraftsBoxIcon, FlashIcon, FlipIcon, MapPinIcon, PersonIcon, SearchIcon, VerifiedMark): they paint shapes but no text.
- `[RENDER_THIN]` on BottomSheetModal: RN `Modal` renders through a portal.

## App bug found while syncing (not a sync issue)

- `src/components/Badges.tsx` `roundedPath()` documents its radii as 0–1 ratios, but `SHAPES` passes values like 18/42/58 (percent), so radii become 18×–58× the box and `LabelBadge` outlines come out squarish instead of the intended blobs. The preview renders it faithfully.

## Re-sync risks

- Previews hard-code sample data for `LabelBadge` (a cast `any` label) and `DistrictBadge` (tier table copied from `REGION_TIERS`); update them if `src/lib/labels.ts` changes.
- `dtsPropsFor` for `Button` / `Row` / `PhotoBox` is hand-written (RN `ViewStyle` can't resolve in the browser `.d.ts`) — keep in step with `src/components/ui.tsx`.
- Entry list in `design-sync-entry/index.ts` is hand-maintained; new components in `src/components` are not picked up automatically.
- Assumes react-native-web 0.21 + Node 22; fonts come from `node_modules/@expo-google-fonts`.
- Screens bundle real `app/**` code: a new native import in any screen breaks `build-dist` until a stub is added (esbuild names the module); a new query key must be seeded in `AppScreen.makeClient`.
- Sample data is dated Sep–Oct 2026 and screens use the real "now" (calendar month, "today") — the calendar will look emptier as time passes; update `mock-data.ts` dates.
- `LabelBookScreen` / `LabelBadge` shapes mirror the app's `roundedPath` bug; if that is fixed in `Badges.tsx`, regrade those cells.
- New screens under `app/` are not picked up automatically — add them to `screens.tsx`, `gen-screens`-style previews and the `cardMode` overrides.

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
- `TabBar` (expo-router) and `PaperMap` (native Naver map) are intentionally **not** synced.

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

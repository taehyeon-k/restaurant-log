# DINARY (mobile) — how to build with this library

DINARY is a Korean restaurant-diary app. These components are the app's real React Native
components, compiled for the browser through `react-native-web`. Build **phone-width screens
(about 390px)** in Korean, on a warm paper background.

## Setup — wrap once, at the root

`ScreenHead`, `BottomSheetModal` and `Placeholder` read the device's safe-area insets and
**throw (blank render) without a provider**. Wrap the whole design once:

```jsx
const { SafeAreaProvider, ScreenHead, Chip, Button } = window.Dinary;

<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  {/* screens */}
</SafeAreaProvider>
```

`styles.css` already loads the fonts and tokens — do not add other fonts.

## Styling idiom — props, not classes

There are **no CSS utility classes**. Components style themselves; you only add layout glue
(`div`s with inline styles) around them, using the tokens below:

| Token | Use |
|---|---|
| `var(--dinary-paper)` `var(--dinary-card)` | screen background / card surface |
| `var(--dinary-ink)` `var(--dinary-muted)` `var(--dinary-faint)` | primary / secondary / tertiary text |
| `var(--dinary-brick)` `var(--dinary-brick-soft)` | the single accent colour and its tint |
| `var(--dinary-line)` `var(--dinary-line-soft)` | hairline borders |
| `var(--dinary-kakao)` | Kakao login button only |
| `var(--dinary-font-serif)` | titles (Gowun Batang) |
| `var(--dinary-font-sans)` | body text (Noto Sans KR) |
| `var(--dinary-font-mono)` | small caps labels, numbers (JetBrains Mono) |

## Gotchas

- Events are **`onPress`**, not `onClick`. `Button` needs `label` + `onPress`; `Chip` needs `label`, `active`, `onPress`.
- Components are flex children: a lone `Chip`, `MobileStars` or icon stretches to the full width of a block parent. Put them in a flex row, or wrap in `<div style={{ display: "inline-flex" }}>`.
- Icons (`CalendarIcon`, `MapPinIcon`, `BookmarkIcon`, `PersonIcon`, `CameraIcon`, `BellIcon`, `SearchIcon`, `FlashIcon`, `FlipIcon`, `DraftsBoxIcon`) take `size` and `stroke` (default black) — pass `stroke="#1c1a17"` or the accent `#b4552d`.
- `VerifiedMark` / `BurstIcon` are the brick-coloured "visited and verified" seal; `LabelBadge` / `DistrictBadge` are collected-achievement stamps and take structured data (see their `.d.ts`).
- `Pigs` shows felt price level 1–5 from `{ price_level, price_range }`.

## One idiomatic screen header

```jsx
<div style={{ width: 390, background: "var(--dinary-paper)" }}>
  <ScreenHead eyebrow="DRAFTS" title="보관함" sub="아직 인증하지 못한 기록 3개" onBack={() => {}} />
  <div style={{ display: "flex", gap: 8, padding: "0 22px" }}>
    <Chip label="전체" active onPress={() => {}} />
    <Chip label="한식" active={false} onPress={() => {}} />
  </div>
</div>
```

Read `styles.css` and `_ds_bundle.css` for tokens; each component's `.d.ts` and `.prompt.md` for its API.

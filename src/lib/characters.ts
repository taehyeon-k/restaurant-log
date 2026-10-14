/**
 * 캐릭터 모으기 — 목록·등급·그림(HANDOFF-characters.md §1·§3).
 * 앱(expo-app/src/lib/characters.ts)과 웹(src/lib/characters.ts)이 같은 파일을 씁니다. 한쪽을 고치면 다른 쪽도 그대로 옮기세요.
 * 그림은 플랫폼에 묶이지 않게 도형 목록(ART)으로 두고, 각 Character.tsx 가 react-native-svg / <svg> 로 그립니다.
 */

export type Rarity = "common" | "rare" | "legend";

export const CHARACTER_IDS = ["plate", "onigiri", "tteok", "ramen", "pizza", "burger", "sushi", "fish"] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export type CharacterDef = { id: CharacterId; name: string; rarity: Rarity };

export const CHARACTERS: CharacterDef[] = [
  { id: "plate", name: "빈 접시", rarity: "common" },
  { id: "onigiri", name: "오니기리", rarity: "common" },
  { id: "tteok", name: "쏘야", rarity: "common" },
  { id: "ramen", name: "라멘", rarity: "common" },
  { id: "pizza", name: "피자 조각", rarity: "rare" },
  { id: "burger", name: "햄버거", rarity: "rare" },
  { id: "sushi", name: "연어 초밥", rarity: "rare" },
  { id: "fish", name: "생구는 1티어", rarity: "legend" },
];

/** 가입하면 받는 캐릭터. */
export const DEFAULT_CHARACTER: CharacterId = "plate";

export const RARITY: Record<Rarity, { name: string; percent: number; ink: string; bg: string }> = {
  common: { name: "보통", percent: 65, ink: "#8a8377", bg: "#f1ede4" },
  rare: { name: "레어", percent: 30, ink: "#5f7a8a", bg: "#e9eff2" },
  legend: { name: "전설", percent: 5, ink: "#b58a2b", bg: "#fbf4e2" },
};

/** 도감에 묶는 순서 — 전설 → 레어 → 보통. */
export const RARITY_ORDER: Rarity[] = ["legend", "rare", "common"];

/** 인증 기록 몇 건마다 뽑기권 1장. */
export const VERIFIED_PER_TICKET = 5;

export const isCharacterId = (v: unknown): v is CharacterId =>
  typeof v === "string" && (CHARACTER_IDS as readonly string[]).includes(v);

export const characterOf = (id: string | null | undefined): CharacterDef =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/* ───────────────────────── 그림 ───────────────────────── */

/** 모든 캐릭터의 viewBox. 높이 = 너비 × 212 / 200. */
export const CHARACTER_VIEWBOX = { w: 200, h: 212 } as const;

type Paint = { fill?: string; stroke?: string; sw?: number };
export type Shape =
  | ({ t: "path"; d: string } & Paint)
  | ({ t: "circle"; cx: number; cy: number; r: number } & Paint)
  | ({ t: "ellipse"; cx: number; cy: number; rx: number; ry: number } & Paint)
  | ({ t: "rect"; x: number; y: number; w: number; h: number; rx?: number } & Paint)
  | { t: "g"; transform: string; children: Shape[] };

const OUT = "#3a3129";
const SW = 4.5;
const BLUSH = "#f2a58e";

/** 눈·볼·입 — (cx, cy) 가 두 눈의 가운데. */
const face = (cx: number, cy: number, s = 1, blush = BLUSH): Shape[] => [
  { t: "ellipse", cx: cx - 22 * s, cy: cy + 10 * s, rx: 7 * s, ry: 4 * s, fill: blush },
  { t: "ellipse", cx: cx + 22 * s, cy: cy + 10 * s, rx: 7 * s, ry: 4 * s, fill: blush },
  { t: "circle", cx: cx - 14 * s, cy, r: 4.6 * s, fill: OUT },
  { t: "circle", cx: cx + 14 * s, cy, r: 4.6 * s, fill: OUT },
  { t: "circle", cx: cx - 12.6 * s, cy: cy - 1.6 * s, r: 1.5 * s, fill: "#ffffff" },
  { t: "circle", cx: cx + 15.4 * s, cy: cy - 1.6 * s, r: 1.5 * s, fill: "#ffffff" },
  { t: "path", d: `M${cx - 6 * s} ${cy + 8 * s}Q${cx} ${cy + 14 * s} ${cx + 6 * s} ${cy + 8 * s}`, stroke: OUT, sw: 3.4 * s, fill: "none" },
];

const feet = (y: number, gap = 22): Shape[] => [
  { t: "ellipse", cx: 100 - gap, cy: y, rx: 14, ry: 7.5, fill: OUT },
  { t: "ellipse", cx: 100 + gap, cy: y, rx: 14, ry: 7.5, fill: OUT },
];

const arms = (ly: number, lx: number, rx: number): Shape[] => [
  { t: "path", d: `M${lx} ${ly}Q${lx - 18} ${ly + 4} ${lx - 22} ${ly - 14}`, stroke: OUT, sw: SW, fill: "none" },
  { t: "path", d: `M${rx} ${ly}Q${rx + 18} ${ly + 4} ${rx + 22} ${ly - 14}`, stroke: OUT, sw: SW, fill: "none" },
];

/** 포크 — 자기 좌표 16×70, 위가 날. */
export const UT_FORK: Shape[] = [
  { t: "rect", x: 6, y: 24, w: 4.5, h: 46, rx: 2.2, fill: "#d6d0c4", stroke: OUT, sw: 2.4 },
  { t: "path", d: "M2 2v13a6.2 6.2 0 0 0 12.4 0V2", fill: "#d6d0c4", stroke: OUT, sw: 2.4 },
  { t: "path", d: "M6.2 2v12M10.2 2v12", stroke: OUT, sw: 2, fill: "none" },
];

/** 숟가락 — 자기 좌표 16×70, 위가 머리. */
export const UT_SPOON: Shape[] = [
  { t: "rect", x: 6, y: 20, w: 4.5, h: 50, rx: 2.2, fill: "#d6d0c4", stroke: OUT, sw: 2.4 },
  { t: "ellipse", cx: 8.2, cy: 11, rx: 7.4, ry: 10, fill: "#d6d0c4", stroke: OUT, sw: 2.4 },
];

const sparkle = (x: number, y: number, r: number, fill = "#e0b44a"): Shape => ({
  t: "path",
  d: `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`,
  fill,
});

export const ART: Record<CharacterId, Shape[]> = {
  plate: [
    ...feet(194),
    ...arms(122, 34, 166),
    { t: "g", transform: "translate(10 38) rotate(-10)", children: UT_FORK },
    { t: "g", transform: "translate(180 34) rotate(10)", children: UT_SPOON },
    { t: "circle", cx: 100, cy: 112, r: 72, fill: "#fbfaf6", stroke: OUT, sw: SW },
    { t: "circle", cx: 100, cy: 112, r: 52, fill: "#f1ede4", stroke: "#d8d3c8", sw: 3 },
    { t: "path", d: "M50 82a58 58 0 0 1 30-26", stroke: "#ffffff", sw: 5, fill: "none" },
    ...face(100, 108),
  ],
  onigiri: [
    ...feet(190),
    ...arms(134, 40, 160),
    { t: "path", d: "M100 30Q112 30 120 44L172 140Q182 172 150 174L50 174Q18 172 28 140L80 44Q88 30 100 30Z", fill: "#fbfaf6", stroke: OUT, sw: SW },
    { t: "ellipse", cx: 70, cy: 112, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "ellipse", cx: 130, cy: 74, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "ellipse", cx: 142, cy: 128, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "ellipse", cx: 92, cy: 64, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "rect", x: 68, y: 132, w: 64, h: 44, rx: 6, fill: "#2f3a30", stroke: OUT, sw: SW },
    { t: "path", d: "M80 144h10", stroke: "#4c5a4c", sw: 3, fill: "none" },
    ...face(100, 104),
  ],
  tteok: [
    ...feet(190, 20),
    ...arms(122, 58, 142),
    { t: "rect", x: 56, y: 32, w: 88, h: 146, rx: 42, fill: "#d9573a", stroke: OUT, sw: SW },
    { t: "path", d: "M76 58Q70 78 72 100", stroke: "#f2a58e", sw: 6, fill: "none" },
    { t: "ellipse", cx: 120, cy: 56, rx: 3.4, ry: 2, fill: "#fbf4e2" },
    { t: "ellipse", cx: 84, cy: 150, rx: 3.4, ry: 2, fill: "#fbf4e2" },
    { t: "ellipse", cx: 124, cy: 158, rx: 3.4, ry: 2, fill: "#fbf4e2" },
    { t: "path", d: "M104 36q8 8 2 18", stroke: "#8fb35a", sw: 4, fill: "none" },
    ...face(100, 104, 0.92, "#f7c0ad"),
  ],
  ramen: [
    ...feet(194),
    { t: "path", d: "M150 18L114 98", stroke: "#8c6239", sw: 6, fill: "none" },
    { t: "path", d: "M166 24L124 100", stroke: "#8c6239", sw: 6, fill: "none" },
    { t: "path", d: "M34 106Q44 76 62 94Q78 68 96 92Q112 66 130 92Q148 70 166 106Z", fill: "#f2d27a", stroke: OUT, sw: SW },
    { t: "path", d: "M60 98q8-10 14 0M100 96q8-12 16 0", stroke: "#d9a845", sw: 3, fill: "none" },
    { t: "circle", cx: 132, cy: 92, r: 10, fill: "#fbfaf6", stroke: OUT, sw: 3 },
    { t: "path", d: "M132 92m-4 0a4 4 0 1 1 4 4", stroke: "#e8735e", sw: 2.6, fill: "none" },
    ...arms(140, 36, 164),
    { t: "path", d: "M26 104H174Q172 176 100 182Q28 176 26 104Z", fill: "#c8643b", stroke: OUT, sw: SW },
    { t: "path", d: "M40 120h120", stroke: "#f6d8c6", sw: 3.4, fill: "none" },
    { t: "path", d: "M50 120v6h8v-6M76 120v6h8v-6M102 120v6h8v-6M128 120v6h8v-6", stroke: "#f6d8c6", sw: 2.4, fill: "none" },
    ...face(100, 146, 0.92, "#f6b49a"),
  ],
  pizza: [
    ...feet(196, 18),
    ...arms(96, 50, 150),
    { t: "path", d: "M30 54Q100 26 170 54L104 188Q100 196 96 188Z", fill: "#f6d36b", stroke: OUT, sw: SW },
    { t: "path", d: "M60 112q4 14-4 20M146 96q-2 10 4 16", stroke: "#e9b94a", sw: 4, fill: "none" },
    { t: "circle", cx: 66, cy: 84, r: 10, fill: "#c2452d" },
    { t: "circle", cx: 140, cy: 82, r: 9, fill: "#c2452d" },
    { t: "circle", cx: 102, cy: 158, r: 8, fill: "#c2452d" },
    { t: "path", d: "M26 52Q100 18 174 52Q180 70 164 72Q100 46 36 72Q20 70 26 52Z", fill: "#d9a25a", stroke: OUT, sw: SW },
    ...face(100, 108, 0.86),
  ],
  burger: [
    ...feet(192),
    ...arms(138, 30, 170),
    { t: "rect", x: 34, y: 150, w: 132, h: 30, rx: 13, fill: "#d99a4e", stroke: OUT, sw: SW },
    { t: "rect", x: 28, y: 132, w: 144, h: 22, rx: 11, fill: "#6b3f2a", stroke: OUT, sw: SW },
    { t: "path", d: "M36 128H164L152 146L138 134L120 148L104 134L86 146L70 134L52 146Z", fill: "#f6c445", stroke: OUT, sw: 3 },
    { t: "path", d: "M24 128Q36 116 50 126Q62 116 76 126Q88 116 100 126Q112 116 124 126Q138 116 150 126Q162 116 176 128L176 134L24 134Z", fill: "#8fb35a", stroke: OUT, sw: 3.4 },
    { t: "path", d: "M28 122Q28 42 100 40Q172 42 172 122Z", fill: "#d99a4e", stroke: OUT, sw: SW },
    { t: "path", d: "M52 70Q62 56 80 52", stroke: "#efc086", sw: 5, fill: "none" },
    { t: "ellipse", cx: 76, cy: 66, rx: 4, ry: 2.4, fill: "#fbf4e2" },
    { t: "ellipse", cx: 118, cy: 58, rx: 4, ry: 2.4, fill: "#fbf4e2" },
    { t: "ellipse", cx: 146, cy: 76, rx: 4, ry: 2.4, fill: "#fbf4e2" },
    { t: "ellipse", cx: 98, cy: 54, rx: 4, ry: 2.4, fill: "#fbf4e2" },
    ...face(100, 94),
  ],
  sushi: [
    ...feet(192),
    ...arms(150, 38, 162),
    { t: "rect", x: 36, y: 94, w: 128, h: 86, rx: 32, fill: "#fbfaf6", stroke: OUT, sw: SW },
    { t: "ellipse", cx: 56, cy: 160, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "ellipse", cx: 146, cy: 156, rx: 3, ry: 1.8, fill: "#e4dccc" },
    { t: "path", d: "M24 100Q28 58 100 56Q178 58 178 96Q180 114 160 112L44 114Q22 116 24 100Z", fill: "#f08a5d", stroke: OUT, sw: SW },
    { t: "path", d: "M58 64Q70 86 62 108M92 58Q104 82 96 110M128 60Q140 82 134 110", stroke: "#fcd5c0", sw: 5, fill: "none" },
    ...face(100, 138),
  ],
  fish: [
    sparkle(26, 28, 12),
    sparkle(178, 18, 9),
    sparkle(182, 150, 7),
    ...feet(196, 18),
    ...arms(150, 64, 136),
    { t: "rect", x: 62, y: 124, w: 76, h: 64, rx: 26, fill: "#f1ede4", stroke: OUT, sw: SW },
    { t: "path", d: "M84 132v40M116 132v40", stroke: "#e2ddd2", sw: 4, fill: "none" },
    { t: "path", d: "M164 88L196 58Q188 88 196 118Z", fill: "#b0874f", stroke: OUT, sw: SW },
    { t: "ellipse", cx: 98, cy: 88, rx: 74, ry: 48, fill: "#c9a36a", stroke: OUT, sw: SW },
    { t: "path", d: "M84 46L64 96M118 42L94 108M150 52L128 112", stroke: "#7a4e2c", sw: 6, fill: "none" },
    { t: "path", d: "M30 92Q38 98 30 104", stroke: OUT, sw: 3.4, fill: "none" },
    { t: "circle", cx: 46, cy: 76, r: 11, fill: "#fbfaf6", stroke: OUT, sw: 3.4 },
    { t: "circle", cx: 44, cy: 76, r: 4.6, fill: OUT },
    { t: "ellipse", cx: 108, cy: 100, rx: 33, ry: 26, fill: "#fbe9d8", stroke: OUT, sw: SW },
    ...face(108, 96, 0.78),
  ],
};

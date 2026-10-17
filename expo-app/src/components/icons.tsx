import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";

type P = { size?: number; stroke?: string; strokeWidth?: number; fill?: string };

const base = (size: number, stroke: string, strokeWidth: number, fill = "none") => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill,
  stroke,
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const CalendarIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <Path d="M3.5 9.6h17M8.2 3.4v3M15.8 3.4v3" />
    <Path d="M7.6 13.2h3M13.4 13.2h3M7.6 16.8h3" />
  </Svg>
);

export const MapPinIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 21s7-6.3 7-11.3A7 7 0 005 9.7C5 14.7 12 21 12 21z" />
    <Circle cx="12" cy="9.7" r="2.4" />
  </Svg>
);

export const BOOKMARK_PATH =
  "M6.5 2.6h11a1.4 1.4 0 0 1 1.4 1.4v17a.6.6 0 0 1-.95.49L12 16.7l-5.95 4.79a.6.6 0 0 1-.95-.49V4a1.4 1.4 0 0 1 1.4-1.4Z";

export const BookmarkIcon = ({ size = 20, stroke = "#1c1a17", strokeWidth = 1.6, fill = "none" }: P) => (
  <Svg {...base(size, stroke, strokeWidth, fill)}>
    <Path d={BOOKMARK_PATH} />
  </Svg>
);

/** 기념일 — 겹친 원 두 개(HANDOFF-couple §3-7). */
export const RingsIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="9" cy="12.5" r="5.6" />
    <Circle cx="15" cy="12.5" r="5.6" />
  </Svg>
);

export const PersonIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="12" cy="8.6" r="3.8" />
    <Path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" />
  </Svg>
);

export const CameraIcon = ({ size = 25, stroke = "#fbfaf6", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Rect x="2.5" y="5.5" width="19" height="14" rx="3.5" />
    <Circle cx="12" cy="12.5" r="4" />
    <Path d="M8 5.5L9.4 3h5.2l1.4 2.5" />
  </Svg>
);

export const BellIcon = ({ size = 15, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 3.5c-3 0-5 2.2-5 5.4v3.3c0 1-.4 2-1.2 2.9l-.7.8h13.8l-.7-.8c-.8-.9-1.2-1.9-1.2-2.9V8.9c0-3.2-2-5.4-5-5.4Z" />
    <Path d="M9.6 19.5a2.4 2.4 0 0 0 4.8 0" />
  </Svg>
);

export const SearchIcon = ({ size = 15, stroke = "#8a8377", strokeWidth = 1.6 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth={strokeWidth}>
    <Circle cx="7" cy="7" r="4.6" />
    <Path d="M10.5 10.5L14 14" />
  </Svg>
);

export const FlashIcon = ({ size = 19, stroke = "#fbfaf6", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M13 2.8 5.5 13.2h5.3L10 21.2l8-10.8h-5.4L13 2.8Z" />
  </Svg>
);

export const FlipIcon = ({ size = 20, stroke = "#fbfaf6", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M20 11a8 8 0 0 0-14.4-4.2L4 8.6M4 4v4.6h4.6" />
    <Path d="M4 13a8 8 0 0 0 14.4 4.2L20 15.4M20 20v-4.6h-4.6" />
  </Svg>
);

export const DownloadIcon = ({ size = 16, stroke = "#fbfaf6", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Svg>
);

export const RefreshIcon = ({ size = 17, stroke = "#fbfaf6", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9" />
    <Path d="M19.5 4v5h-5" />
  </Svg>
);

export const ShareIcon = ({ size = 18, stroke = "#1c1a17", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 3.5v11" />
    <Path d="M8 7.5l4-4 4 4" />
    <Path d="M6 11.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1" />
  </Svg>
);

/** 24각 버스트 — 라벨첩 버튼·인증 뱃지. 좌표는 웹 ui.tsx BURST 와 같은 0–100 좌표계. */
export const BURST_POINTS =
  "50,0 60.6,10.4 75,6.7 79,21 93.3,25 89.6,39.4 100,50 89.6,60.6 93.3,75 79,79 75,93.3 60.6,89.6 50,100 39.4,89.6 25,93.3 21,79 6.7,75 10.4,60.6 0,50 10.4,39.4 6.7,25 21,21 25,6.7 39.4,10.4";

export const BurstIcon = ({ size = 18, fill = "#b4552d" }: { size?: number; fill?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill={fill} />
  </Svg>
);

/** 현재 위치 — 지도 앱에서 흔히 쓰는 조준선(고리 + 네 방향 눈금 + 가운데 점). */
export const LocateIcon = ({ size = 22, stroke = "#b4552d", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="12" cy="12" r="6.5" />
    <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    <Circle cx="12" cy="12" r="2.4" fill={stroke} stroke="none" />
  </Svg>
);

/** 인증 마크 — 버스트 위에 체크. */
export const VerifiedMark = ({ size = 52 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill="#b4552d" />
    <Path d="M30 52l14 14 27-30" stroke="#fbfaf6" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

/* ── 커뮤니티 (design_handoff_community · 21px · 1.6) ── */

/** 두 사람 — 메인 탭바 「커뮤니티」 · 커뮤니티 탭바 「친구」. */
export const PeopleIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="9" cy="8.5" r="3.3" />
    <Path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
    <Circle cx="16.8" cy="9.6" r="2.6" />
    <Path d="M16.4 14.6c2.4.1 4.1 1.7 4.6 4.4" />
  </Svg>
);

/** 나침반 — 하단 「추천」 탭. */
export const CompassIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="12" cy="12" r="8.5" />
    <Path d="M15.4 8.6l-1.9 4.9-4.9 1.9 1.9-4.9z" />
  </Svg>
);

/** 바닥선 위 막대 셋 — 「랭킹」. */
export const RankBarsIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M4 20.5h16" />
    <Rect x="5" y="12" width="4" height="8.5" />
    <Rect x="10" y="6.5" width="4" height="14" />
    <Rect x="15" y="14.5" width="4" height="6" />
  </Svg>
);

/** 세 줄 적힌 종이 — 「게시판」. */
export const BoardIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
    <Path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
  </Svg>
);

/** 사람 + 더하기 — 친구 추가. */
export const AddPersonIcon = ({ size = 17, stroke = "#4d4842", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="10" cy="8.5" r="3.4" />
    <Path d="M3.8 19.5c.7-3.3 3.1-5.1 6.2-5.1 1.5 0 2.8.4 3.9 1.2M18 13v6M15 16h6" />
  </Svg>
);

/** 종 — 커뮤니티 알림. */
export const BellLineIcon = ({ size = 17, stroke = "#4d4842", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <Path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);

/** 돋보기(24 좌표) — 커뮤니티 머리 단추. */
export const SearchLineIcon = ({ size = 16, stroke = "#4d4842", strokeWidth = 1.8 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="11" cy="11" r="6.5" />
    <Path d="M20 20l-4.2-4.2" />
  </Svg>
);

/** 반짝이 — 커뮤니티 「탐색」(HANDOFF-recommend §1-2). */
export const SparkIcon = ({ size = 21, stroke = "#000", strokeWidth = 1.6 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 3.2l1.9 5.4 5.4 1.9-5.4 1.9L12 17.8l-1.9-5.4-5.4-1.9 5.4-1.9z" />
    <Path d="M18.4 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
  </Svg>
);

/** 링크 붙여넣기 — 사슬 두 고리. */
export const LinkIcon = ({ size = 20, stroke = "#b4552d", strokeWidth = 1.8 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M10 13.5a4.2 4.2 0 0 0 6 .3l3-3a4.2 4.2 0 0 0-6-6l-1.6 1.6" />
    <Path d="M14 10.5a4.2 4.2 0 0 0-6-.3l-3 3a4.2 4.2 0 0 0 6 6l1.6-1.6" />
  </Svg>
);

/** 메뉴 👍 — down 이면 180° 돌린 👎. */
export const ThumbIcon = ({ size = 19, stroke = "#a29a8c", strokeWidth = 1.7, down = false }: P & { down?: boolean }) => (
  <Svg {...base(size, stroke, strokeWidth)} style={down ? { transform: [{ rotate: "180deg" }] } : undefined}>
    <Path d="M7 10.5v9.5H4.2a1.2 1.2 0 0 1-1.2-1.2v-7.1a1.2 1.2 0 0 1 1.2-1.2H7z" />
    <Path d="M7 10.5l3.6-6.6a1.9 1.9 0 0 1 3.5 1.3l-.7 3.8h5.2a2 2 0 0 1 2 2.4l-1.3 6.9a2.3 2.3 0 0 1-2.3 1.9H7" />
  </Svg>
);

/** 바깥으로 열기 ↗ — 상자 모서리 화살표. */
export const ExternalIcon = ({ size = 13, stroke = "#4d4842", strokeWidth = 1.7 }: P) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M14 4h6v6M20 4l-9 9" />
    <Path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Svg>
);

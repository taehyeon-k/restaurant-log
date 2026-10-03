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

/** 24각 버스트 — 라벨첩 버튼·인증 뱃지. 좌표는 웹 ui.tsx BURST 와 같은 0–100 좌표계. */
export const BURST_POINTS =
  "50,0 60.6,10.4 75,6.7 79,21 93.3,25 89.6,39.4 100,50 89.6,60.6 93.3,75 79,79 75,93.3 60.6,89.6 50,100 39.4,89.6 25,93.3 21,79 6.7,75 10.4,60.6 0,50 10.4,39.4 6.7,25 21,21 25,6.7 39.4,10.4";

export const BurstIcon = ({ size = 18, fill = "#b4552d" }: { size?: number; fill?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill={fill} />
  </Svg>
);

/** 인증 마크 — 버스트 위에 체크. */
export const VerifiedMark = ({ size = 52 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Polygon points={BURST_POINTS} fill="#b4552d" />
    <Path d="M30 52l14 14 27-30" stroke="#fbfaf6" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

import Svg, { Path } from "react-native-svg";

/** 보관함(서류철) — 기록이 모여 있는 곳이므로 폴더 모양을 씁니다. */
export const DraftsBoxIcon = ({ size = 23, stroke = "#1c1a17" }: { size?: number; stroke?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 7.4V19a1.4 1.4 0 0 0 1.4 1.4h15.2A1.4 1.4 0 0 0 21 19V9.2a1.4 1.4 0 0 0-1.4-1.4h-7L10.4 5.2a1.4 1.4 0 0 0-1.1-.6H4.4A1.4 1.4 0 0 0 3 6v1.4Z" />
    <Path d="M7.2 13.2h9.6" />
    <Path d="M7.2 16.6h6" />
  </Svg>
);

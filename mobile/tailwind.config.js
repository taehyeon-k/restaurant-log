/**
 * 디자인 토큰 — 웹의 `src/app/globals.css` @theme 을 그대로 옮긴 값입니다.
 * 색을 새로 만들지 마세요. 값이 애매하면 원본 저장소의 해당 컴포넌트를 먼저 보십시오.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        paper: "#f6f3ec",
        card: "#fbfaf6",
        ink: "#1c1a17",
        brick: "#b4552d",
        "brick-soft": "#f7ece5",
        line: "#d8d3c8",
        "line-soft": "#e2ddd2",
        muted: "#6b665e",
        faint: "#8a8377",
        map: "#e7e3d8",
        "map-grid": "#dcd7c9",
        "map-road": "#f1ede2",
        "map-park": "#dfe4d6",
        // 카카오 로그인 버튼 — 카카오 브랜드 가이드가 정한 색이라 종이 팔레트를 따르지 않습니다.
        kakao: "#fee500",
      },
      fontFamily: {
        serif: ["GowunBatang_400Regular"],
        "serif-bold": ["GowunBatang_700Bold"],
        sans: ["NotoSansKR_400Regular"],
        mono: ["JetBrainsMono_400Regular"],
      },
    },
  },
  plugins: [],
};

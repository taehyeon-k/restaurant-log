import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Noto_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const gowun = Gowun_Batang({
  variable: "--font-gowun",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const noto = Noto_Sans_KR({
  variable: "--font-noto",
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DINARY",
  description: "다녀온 맛집과 카페를 지도에 기록합니다",
};

/** 폰에서는 노치 밑까지 화면을 씁니다 — 안전 영역은 각 화면이 직접 피합니다. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f3ec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${gowun.variable} ${noto.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}

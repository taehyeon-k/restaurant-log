import type { Metadata } from "next";
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
  title: "오늘의 식탁",
  description: "다녀온 맛집과 카페를 지도에 기록합니다",
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

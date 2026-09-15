import type { Metadata } from "next";
import LoginScreen from "./LoginScreen";

export const metadata: Metadata = {
  title: "로그인 — DINARY",
};

export default function LoginPage() {
  return <LoginScreen />;
}

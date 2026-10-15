import { Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { C, F } from "@/theme";

export type AuthVariant = "apple" | "google";

/** Apple 로고(단색) — 공식 에셋으로 바꿀 때는 이 path 만 교체하면 됩니다. */
function AppleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 384 512">
      <Path
        fill="#FFFFFF"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </Svg>
  );
}

/** 구글 공식 4색 G 마크 — "Google로 시작하기" 버튼 전용(웹 LoginScreen 과 같은 path). */
function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <Path fill="#FBBC05" d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 000 9c0 1.4523.3477 2.8264.9573 4.0418L3.9641 10.71z" />
      <Path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </Svg>
  );
}

const LABEL: Record<AuthVariant, string> = { apple: "Apple로 시작하기", google: "Google로 시작하기" };

/** 로그인 화면 소셜 버튼 — Apple · Google 이 같은 레이아웃 코드를 씁니다. */
export function AuthButton({ variant, busy, disabled, onPress }: { variant: AuthVariant; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const apple = variant === "apple";
  return (
    <Pressable style={[s.btn, apple ? s.apple : s.google, disabled && s.dim]} disabled={disabled} onPress={onPress}>
      {apple ? <AppleIcon /> : <GoogleIcon />}
      <Text style={[s.text, apple && { color: "#FFFFFF" }]}>{busy ? "연결하는 중…" : LABEL[variant]}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { height: 52, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  text: { flex: 1, fontFamily: F.sansMd, fontSize: 15, color: C.ink },
  apple: { backgroundColor: "#000000" },
  google: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  dim: { opacity: 0.7 },
});

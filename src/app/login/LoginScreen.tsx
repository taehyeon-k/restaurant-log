"use client";

import { useState } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { supabase } from "@/lib/supabase/client";

type Provider = "kakao" | "google";

// 카카오 로그인에 문제가 생겨 한동안 막아둡니다 — 고치면 이 줄만 true로 되돌리면 됩니다.
const KAKAO_ENABLED = false;

/** 말풍선 마크 — 카카오 로그인 버튼 전용(카카오 브랜드 가이드가 정한 모양). */
function KakaoIcon() {
  return (
    <span className="relative block h-5 w-[22px] shrink-0 rounded-[50%/58%] bg-ink">
      <span
        className="absolute bottom-[-3px] left-1 h-[7px] w-1.5 bg-ink"
        style={{ clipPath: "polygon(0 0, 100% 0, 18% 100%)" }}
      />
    </span>
  );
}

/** 구글 공식 4색 G 마크 — "Google로 시작하기" 버튼 전용. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 000 9c0 1.4523.3477 2.8264.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}

function AuthButtons({
  tall,
  onLogin,
  busy,
  error,
}: {
  tall?: boolean;
  onLogin: (p: Provider) => void;
  busy: Provider | null;
  error: string;
}) {
  const h = tall ? "min-h-14" : "min-h-[54px]";
  const text = tall ? "text-[15.5px]" : "text-[15px]";
  const px = tall ? "px-5" : "px-[18px]";

  return (
    <div className="flex w-full flex-col gap-[11px]">
      {KAKAO_ENABLED && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onLogin("kakao")}
          className={`flex ${h} w-full items-center gap-3 rounded-2xl bg-kakao ${px} ${text} font-medium text-ink shadow-[0_2px_8px_rgba(28,26,23,.08)] disabled:opacity-70`}
        >
          <KakaoIcon />
          <span className="flex-1 text-left">
            {busy === "kakao" ? "연결하는 중…" : "카카오로 시작하기"}
          </span>
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onLogin("google")}
        className={`flex ${h} w-full items-center gap-3 rounded-2xl border border-line bg-card ${px} ${text} font-medium text-ink shadow-[0_2px_8px_rgba(28,26,23,.05)] hover:bg-line-soft disabled:opacity-70`}
      >
        <GoogleIcon />
        <span className="flex-1 text-left">
          {busy === "google" ? "연결하는 중…" : "Google로 시작하기"}
        </span>
      </button>
      {error && <p className="pt-1 text-center text-[12px] text-brick">{error}</p>}
    </div>
  );
}

function Terms() {
  return (
    <p className="mt-[18px] text-center text-[11px] leading-[1.7] text-faint">
      계속하면 <a href="/terms" className="text-brick">이용약관</a>과{" "}
      <a href="/privacy" className="text-brick">개인정보 처리방침</a>에 동의하는 것으로 봅니다.
    </p>
  );
}

/**
 * 시안 01(폰) · 04(데스크톱) — 폭 744px 미만이면 폰 레이아웃, `Shell.tsx` 의 기준과 같습니다.
 * 로그인 없이는 어떤 화면도 열리지 않으므로(HANDOFF §0) 둘러보기 없이 두 버튼뿐입니다.
 */
export default function LoginScreen() {
  const isMobile = useMediaQuery("(max-width: 743px), (max-height: 700px)");
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  async function login(provider: Provider) {
    setBusy(provider);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // 카카오는 이메일 동의항목을 쓰지 않습니다(HANDOFF-auth.md §1) — 닉네임·프로필 사진만 요청합니다.
        ...(provider === "kakao" ? { scopes: "profile_nickname profile_image" } : {}),
      },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  if (isMobile === null) return <div className="h-dvh bg-paper" />;

  if (!isMobile) {
    return (
      <div className="relative flex h-dvh w-full flex-col items-center justify-center bg-paper">
        <div className="flex w-[392px] max-w-[calc(100%-48px)] flex-col items-center">
          <div
            className="font-serif text-[68px] leading-none font-bold tracking-[0.16em] text-ink"
            style={{ textIndent: "0.16em" }}
          >
            DINARY
          </div>
          <div className="mt-4 text-[13px] text-faint">다이닝에 다이어리를 더하다.</div>

          <div className="mt-[52px] w-full">
            <AuthButtons tall onLogin={login} busy={busy} error={error} />
          </div>
          <Terms />
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-[52px] items-center justify-between px-7 font-mono text-[10.5px] tracking-[0.06em] text-faint">
          <span>DINARY</span>
          <span>기록은 나만 봅니다</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh w-full flex-col bg-paper px-[30px]"
      style={{
        paddingTop: "max(132px, calc(env(safe-area-inset-top) + 90px))",
        paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 20px))",
      }}
    >
      <div className="text-center">
        <div className="font-serif text-[58px] leading-none font-bold tracking-[0.14em] text-ink">
          DINARY
        </div>
        <div className="mt-3 text-[12px] text-faint">다이닝에 다이어리를 더하다.</div>
      </div>

      <div className="flex-1" />

      <AuthButtons onLogin={login} busy={busy} error={error} />
      <Terms />
    </div>
  );
}

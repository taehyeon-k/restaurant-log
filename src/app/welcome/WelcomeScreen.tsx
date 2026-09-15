"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { supabase } from "@/lib/supabase/client";
import { uploadPhoto } from "@/lib/photos";
import { photoFill } from "@/app/_components/mobile/ui";

const MAX_LEN = 12;

function Avatar({
  url,
  uploading,
  onPick,
}: {
  url: string | null;
  uploading: boolean;
  onPick: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="grid size-[78px] shrink-0 place-items-center rounded-full border border-line"
        style={photoFill(url, null)}
      >
        {!url && (
          <span className="font-mono text-[8.5px] tracking-[0.06em] text-faint">
            {uploading ? "…" : "PHOTO"}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        className="min-h-[38px] cursor-pointer rounded-full border border-line bg-card px-3.5 text-[12.5px] text-ink hover:bg-line-soft disabled:opacity-70"
      >
        {uploading ? "올리는 중…" : "사진 고르기"}
      </button>
    </div>
  );
}

/** 시안 02 — 첫 로그인에만. 폭 744px 미만이면 폰 레이아웃(`Shell.tsx`와 같은 기준). */
export default function WelcomeScreen({
  initialNickname,
  initialAvatarUrl,
  fromOAuth,
  provider,
}: {
  initialNickname: string;
  initialAvatarUrl: string | null;
  fromOAuth: boolean;
  provider: string;
}) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 743px), (max-height: 700px)");
  const fileRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState(initialNickname);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setAvatarUrl(await uploadPhoto(file, file.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ nickname: trimmed, avatar_url: avatarUrl })
      .eq("id", user.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (isMobile === null) return <div className="h-dvh bg-paper" />;

  const body = (
    <form onSubmit={handleSubmit} className="flex w-full flex-col" style={isMobile ? undefined : { minHeight: 0 }}>
      {isMobile && <div className="eyebrow">STEP 1 / 1</div>}
      <h1 className={`font-serif text-[24px] font-bold ${isMobile ? "mt-3" : "mt-0"}`}>
        어떻게 부를까요?
      </h1>
      <p className="mt-2.5 text-[12.5px] leading-[1.75] text-faint">
        기록장 맨 위에 쓰입니다. 나중에 바꿀 수 있습니다.
      </p>

      <div className="mt-8.5">
        <Avatar url={avatarUrl} uploading={uploading} onPick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      <div className="mt-8.5">
        <div className="eyebrow">NICKNAME</div>
        <div className="mt-2 flex items-center gap-2.5 border-b-[1.5px] border-brick pb-2.5">
          <input
            value={nickname}
            onChange={(e) => {
              setTouched(true);
              setNickname(e.target.value.slice(0, MAX_LEN));
            }}
            placeholder="닉네임"
            className="flex-1 border-none bg-transparent font-serif text-[21px] font-bold text-ink outline-none placeholder:text-faint"
          />
          <span className="font-mono text-[10.5px] text-faint">
            {nickname.length}/{MAX_LEN}
          </span>
        </div>
        {fromOAuth && !touched && (
          <div className="mt-2.5 text-[11.5px] text-faint">
            {provider} 계정 이름을 가져왔습니다.
          </div>
        )}
        {error && <div className="mt-2.5 text-[11.5px] text-brick">{error}</div>}
      </div>

      {isMobile && <div className="flex-1" />}

      <button
        type="submit"
        disabled={!nickname.trim() || saving}
        className={`w-full cursor-pointer rounded-2xl bg-brick px-5 text-[15px] font-medium text-card shadow-[0_6px_16px_rgba(160,74,38,.22)] hover:bg-[#a04a26] disabled:cursor-default disabled:opacity-60 ${
          isMobile ? "mt-0 min-h-[54px]" : "mt-9 min-h-[54px]"
        }`}
      >
        {saving ? "저장하는 중…" : "기록 시작하기"}
      </button>
    </form>
  );

  if (!isMobile) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-paper">
        <div className="w-[392px] max-w-[calc(100%-48px)]">{body}</div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh w-full flex-col bg-paper px-[30px]"
      style={{
        paddingTop: "max(96px, calc(env(safe-area-inset-top) + 54px))",
        paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 20px))",
      }}
    >
      {body}
    </div>
  );
}

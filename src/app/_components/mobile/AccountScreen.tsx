"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { earnedLabels } from "@/lib/labels";
import { uploadPhoto } from "@/lib/photos";
import type { Restaurant, Wish } from "@/lib/types";
import { Eyebrow, photoFill } from "./ui";

export type AccountInfo = {
  nickname: string;
  avatarUrl: string | null;
  /** 프로필이 만들어진 시각(ISO) — SINCE 표시에 씁니다. */
  since: string;
  /** 연결된 로그인 수단, 예: ["kakao"] */
  providers: string[];
  /** 닉네임 옆에 내건 대표 라벨(src/lib/labels.ts LABELS 의 id). 없으면 null. */
  titleLabelId: string | null;
};

const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", google: "구글" };

const since = (iso: string) => `SINCE ${iso.slice(0, 4)}.${iso.slice(5, 7)}`;

const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

function downloadRecords(rows: Restaurant[], wishes: Wish[]) {
  const payload = { exported_at: new Date().toISOString(), restaurants: rows, wishes };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dinary-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ value, label, brick }: { value: number; label: string; brick?: boolean }) {
  return (
    <div className="px-2.5 py-3.5 text-center">
      <div className={`font-mono text-[22px] ${brick ? "text-brick" : "text-ink"}`}>{value}</div>
      <div className="mt-1 text-[11px] text-faint">{label}</div>
    </div>
  );
}

function Row({
  label,
  right,
  onClick,
  danger,
  border = true,
}: {
  label: string;
  right: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  border?: boolean;
}) {
  const shared = `flex min-h-[50px] w-full items-center justify-between px-4 text-[13.5px] ${
    danger ? "text-faint" : "text-ink"
  } ${border ? "border-t border-line-soft" : ""}`;

  if (!onClick) {
    return (
      <div className={shared}>
        <span>{label}</span>
        {right}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`cursor-pointer border-none bg-transparent hover:bg-line-soft ${shared}`}>
      <span>{label}</span>
      {right}
    </button>
  );
}

/**
 * 시안 03 — TabBar 「내계정」 탭 내용. 새 라우트가 아니라 이 탭 안에서만 삽니다(HANDOFF-auth.md §3.3).
 */
export default function AccountScreen({
  account,
  rows,
  wishes,
  onOpenLabels,
}: {
  account: AccountInfo;
  rows: Restaurant[];
  wishes: Wish[];
  /** 라벨첩(전체 목록)을 여는 함수 — 상위 MobileShell 이 관리합니다. */
  onOpenLabels: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [titleLabelId, setTitleLabelId] = useState(account.titleLabelId);
  const [labelBusy, setLabelBusy] = useState(false);
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState("");

  const records = rows.filter((r) => !r.pending).length;
  const verified = rows.filter((r) => r.verified).length;
  const places = new Set(rows.map(placeKeyOf)).size;

  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned);
  const titleLabel = titleLabelId ? got.find((l) => l.id === titleLabelId) ?? null : null;

  const connectedLine = account.providers.length
    ? account.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" · ") + " 연결됨"
    : "연결된 계정 없음";

  async function saveAvatar(url: string | null) {
    setAvatarBusy(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다");
      setAvatarBusy(false);
      return;
    }
    const { error } = await supabase.from("profiles").upsert({ id: user.id, avatar_url: url });
    setAvatarBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAvatarUrl(url);
    router.refresh();
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setError("");
    try {
      await saveAvatar(await uploadPhoto(file, file.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다");
      setAvatarBusy(false);
    }
  }

  async function selectTitleLabel(id: string) {
    if (labelBusy) return;
    const next = titleLabelId === id ? null : id;
    setLabelBusy(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다");
      setLabelBusy(false);
      return;
    }
    const { error } = await supabase.from("profiles").upsert({ id: user.id, title_label_id: next });
    setLabelBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTitleLabelId(next);
    router.refresh();
  }

  async function logout() {
    setBusy("logout");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function withdraw() {
    if (!confirm("탈퇴하면 계정과 모든 기록·사진이 되돌릴 수 없게 삭제됩니다. 계속할까요?")) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "탈퇴하지 못했습니다");
      }
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "탈퇴하지 못했습니다");
      setBusy(null);
    }
  }

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-[74px] z-[1160] overflow-y-auto bg-paper px-5 pb-8"
      style={{ paddingTop: "max(62px, calc(env(safe-area-inset-top) + 20px))" }}
    >
      <Eyebrow wide>PROFILE</Eyebrow>

      <div className="mt-4 flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={avatarBusy}
          aria-label="프로필 사진 바꾸기"
          className="relative size-16 shrink-0 cursor-pointer rounded-full border border-line bg-transparent p-0 disabled:opacity-70"
          style={photoFill(avatarUrl, null)}
        >
          <span className="absolute -right-[2px] -bottom-[2px] grid size-[22px] place-items-center rounded-full border-2 border-paper bg-ink text-[10px] text-card">
            ✎
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-serif text-[21px] font-bold">
              {account.nickname || "이름 없음"}
            </span>
            {titleLabel && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[3px] text-[10.5px] font-bold"
                style={{
                  borderColor: `${titleLabel.color}4d`,
                  background: `${titleLabel.color}1a`,
                  color: titleLabel.color,
                }}
              >
                {titleLabel.name}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-[11px] bg-brick-soft px-2 py-[3px] text-[10.5px] text-muted">
              <span className="size-[7px] rounded-full bg-ink" />
              {connectedLine}
            </span>
            <span className="font-mono text-[10px] text-faint">{since(account.since)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 text-[11px]">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="cursor-pointer border-none bg-transparent p-0 text-brick disabled:opacity-60"
            >
              {avatarBusy ? "처리하는 중…" : "사진 바꾸기"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => saveAvatar(null)}
                disabled={avatarBusy}
                className="cursor-pointer border-none bg-transparent p-0 text-faint disabled:opacity-60"
              >
                기본 이미지로
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4.5 grid grid-cols-3 divide-x divide-line-soft rounded-[18px] border border-line-soft bg-card">
        <Stat value={records} label="기록" />
        <Stat value={verified} label="인증" brick />
        <Stat value={places} label="식당" />
      </div>

      {got.length > 0 && (
        <>
          <div className="mt-5 flex items-baseline justify-between">
            <span className="font-serif text-[15px] font-bold">모은 라벨</span>
            <button
              type="button"
              onClick={onOpenLabels}
              className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10.5px] text-faint"
            >
              {got.length} / {labels.length} ›
            </button>
          </div>
          <div className="mt-1 text-[10.5px] text-faint">탭하면 닉네임 옆 대표 라벨로 붙습니다</div>
          <div className="mt-2.5 flex flex-wrap gap-[7px]">
            {[...got]
              .sort((a, b) => Number(b.id === titleLabelId) - Number(a.id === titleLabelId))
              .slice(0, 3)
              .map((l) => {
                const on = l.id === titleLabelId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => selectTitleLabel(l.id)}
                    disabled={labelBusy}
                    aria-pressed={on}
                    className={`cursor-pointer rounded-[13px] border px-2.75 py-[5px] text-[11.5px] disabled:opacity-60 ${
                      on
                        ? "border-brick bg-brick text-[#fdf9f3]"
                        : "border-brick/20 bg-brick-soft text-brick"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {l.name}
                  </button>
                );
              })}
            {got.length > 3 && (
              <button
                type="button"
                onClick={onOpenLabels}
                className="cursor-pointer rounded-[13px] border border-line-soft bg-line-soft px-2.75 py-[5px] text-[11.5px] text-faint"
              >
                +{got.length - 3}
              </button>
            )}
          </div>
        </>
      )}

      <div className="mt-5.5 overflow-hidden rounded-[18px] border border-line-soft bg-card">
        <Row label="계정 연결" right={<span className="font-mono text-[11px] text-faint">{connectedLine}</span>} border={false} />
        <Row
          label="기록 내려받기"
          right={<span className="text-[13px] text-faint">›</span>}
          onClick={() => downloadRecords(rows, wishes)}
        />
        <Row
          label="로그아웃"
          right={<span className="text-[13px] text-faint">›</span>}
          onClick={logout}
        />
        <Row
          label="회원 탈퇴"
          right={<span className="text-[13px] text-faint">›</span>}
          onClick={withdraw}
          danger
        />
      </div>

      {busy && <div className="mt-3 text-center text-[11.5px] text-faint">처리하는 중…</div>}
      {error && <div className="mt-3 text-center text-[11.5px] text-brick">{error}</div>}
    </div>
  );
}

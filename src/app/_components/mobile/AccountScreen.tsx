"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { earnedLabels } from "@/lib/labels";
import type { Restaurant, Wish } from "@/lib/types";
import { Eyebrow, photoFill } from "./ui";

export type AccountInfo = {
  nickname: string;
  avatarUrl: string | null;
  /** 프로필이 만들어진 시각(ISO) — SINCE 표시에 씁니다. */
  since: string;
  /** 연결된 로그인 수단, 예: ["kakao"] */
  providers: string[];
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
}: {
  account: AccountInfo;
  rows: Restaurant[];
  wishes: Wish[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState("");

  const records = rows.filter((r) => !r.pending).length;
  const verified = rows.filter((r) => r.verified).length;
  const places = new Set(rows.map(placeKeyOf)).size;

  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned);

  const connectedLine = account.providers.length
    ? account.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" · ") + " 연결됨"
    : "연결된 계정 없음";

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
        <div
          className="size-16 shrink-0 rounded-full border border-line"
          style={photoFill(account.avatarUrl, null)}
        />
        <div className="min-w-0">
          <div className="truncate font-serif text-[21px] font-bold">
            {account.nickname || "이름 없음"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-[11px] bg-brick-soft px-2 py-[3px] text-[10.5px] text-muted">
              <span className="size-[7px] rounded-full bg-ink" />
              {connectedLine}
            </span>
            <span className="font-mono text-[10px] text-faint">{since(account.since)}</span>
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
            <span className="font-mono text-[10.5px] text-faint">
              {got.length} / {labels.length}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-[7px]">
            {got.slice(0, 3).map((l) => (
              <span
                key={l.id}
                className="rounded-[13px] border border-brick/20 bg-brick-soft px-2.75 py-[5px] text-[11.5px] text-brick"
              >
                {l.name}
              </span>
            ))}
            {got.length > 3 && (
              <span className="rounded-[13px] border border-line-soft bg-line-soft px-2.75 py-[5px] text-[11.5px] text-faint">
                +{got.length - 3}
              </span>
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

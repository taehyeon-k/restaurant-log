"use client";

import { CameraIcon } from "./ui";

export type Tab = "calendar" | "map" | "community" | "account";

const TABS: { id: Tab; label: string }[] = [
  { id: "calendar", label: "월력" },
  { id: "map", label: "지도" },
  { id: "community", label: "커뮤니티" },
  { id: "account", label: "내계정" },
];

function icon(id: Tab) {
  switch (id) {
    case "calendar":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.6h17M8.2 3.4v3M15.8 3.4v3" />
          <path d="M7.6 13.2h3M13.4 13.2h3M7.6 16.8h3" />
        </svg>
      );
    case "map":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s7-6.3 7-11.3A7 7 0 005 9.7C5 14.7 12 21 12 21z" />
          <circle cx="12" cy="9.7" r="2.4" />
        </svg>
      );
    case "community":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 12.4c0 3.5-3.6 6.3-8 6.3-.9 0-1.8-.1-2.6-.3l-4.4 2 1.3-3.4c-1.4-1.2-2.3-2.8-2.3-4.6 0-3.5 3.6-6.3 8-6.3s8 2.8 8 6.3z" />
          <path d="M9 12.3h6" />
        </svg>
      );
    case "account":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8.6" r="3.8" />
          <path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" />
        </svg>
      );
  }
}

function TabButton({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full cursor-pointer flex-col items-center gap-1 border-none bg-transparent pt-3 font-mono text-[9.5px]"
      style={{ letterSpacing: "0.02em", color: active ? "var(--color-brick)" : "#a29a8c" }}
    >
      {icon(id)}
      <span>{label}</span>
    </button>
  );
}

/** 5칸 하단 메뉴바 — 가운데는 바 위로 솟은 카메라 단추(방문 인증). */
export default function TabBar({
  tab,
  onChange,
  onShoot,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  onShoot: () => void;
}) {
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-[1170] grid grid-cols-5 items-start border-t border-line-soft bg-card shadow-[0_-2px_14px_rgba(28,26,23,.06)]"
      style={{ height: "calc(74px + env(safe-area-inset-bottom))" }}
    >
      {left.map((t) => (
        <TabButton key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={() => onChange(t.id)} />
      ))}

      <div className="grid place-items-start justify-center">
        <button
          type="button"
          onClick={onShoot}
          aria-label="사진으로 방문 인증"
          className="-mt-[22px] grid size-[62px] cursor-pointer place-items-center rounded-full border-[3px] border-card bg-brick shadow-[0_8px_20px_rgba(180,85,45,.34)] hover:bg-[#9d4826]"
        >
          <CameraIcon size={26} />
        </button>
      </div>

      {right.map((t) => (
        <TabButton key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={() => onChange(t.id)} />
      ))}
    </div>
  );
}

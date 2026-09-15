import Link from "next/link";

/** /privacy · /terms 공통 뼈대(HANDOFF-auth.md §6.2) — 로그인 없이도 열립니다. */
export default function LegalPage({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-paper px-6 pt-18 pb-24">
      <div className="mx-auto max-w-[640px]">
        <div className="font-mono text-[10px] tracking-[0.18em] text-faint">{kicker}</div>
        <h1 className="mt-2.5 font-serif text-[24px] font-bold">{title}</h1>
        <div className="mt-2 font-mono text-[11px] text-faint">최종 수정 {updated}</div>

        <div className="mt-8 flex flex-col text-[13.5px] leading-[1.85] text-ink">
          {children}
        </div>

        <Link href="/" className="mt-16 inline-block text-[13px] text-brick">
          ← DINARY로 돌아가기
        </Link>
      </div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-serif text-[15px] font-bold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

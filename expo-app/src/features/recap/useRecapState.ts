import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "@/data/profile";
import { useRows } from "@/data/queries";
import { latestRecap, listRecapQuarters } from "./compute";
import type { QuarterId } from "./seasons";

/**
 * 분기 리캡을 띄웠는지(prompted)·끝까지 봤는지(seen) — 계정마다 AsyncStorage `recap:{userId}` 에 둡니다
 * (HANDOFF quarterly recap §3). 지도 초대장·캘린더 카드·탭 점·재생기가 같은 값을 보도록 모듈에 하나만 둡니다.
 */
type Flags = { prompted: Record<QuarterId, true>; seen: Record<QuarterId, true> };
type Snap = { userId: string | null; loaded: boolean; flags: Flags };

const EMPTY: Flags = { prompted: {}, seen: {} };
let snap: Snap = { userId: null, loaded: false, flags: EMPTY };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const keyOf = (userId: string) => `recap:${userId}`;

function load(userId: string) {
  if (snap.userId === userId) return;
  snap = { userId, loaded: false, flags: EMPTY };
  emit();
  AsyncStorage.getItem(keyOf(userId))
    .then((raw) => {
      if (snap.userId !== userId) return;
      let flags = EMPTY;
      try {
        const v = raw ? (JSON.parse(raw) as Partial<Flags>) : null;
        flags = { prompted: v?.prompted ?? {}, seen: v?.seen ?? {} };
      } catch { /* 깨진 값은 처음부터 */ }
      snap = { userId, loaded: true, flags };
      emit();
    })
    .catch(() => {
      if (snap.userId !== userId) return;
      snap = { ...snap, loaded: true };
      emit();
    });
}

function mark(kind: keyof Flags, q: QuarterId) {
  const { userId, flags } = snap;
  if (!userId || flags[kind][q]) return;
  const next = { ...flags, [kind]: { ...flags[kind], [q]: true } };
  snap = { ...snap, flags: next };
  emit();
  AsyncStorage.setItem(keyOf(userId), JSON.stringify(next)).catch(() => {});
}

export function useRecapState() {
  const { data: account } = useAccount();
  const userId = account?.userId ?? null;
  useEffect(() => { if (userId) load(userId); }, [userId]);
  const s = useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => snap,
    () => snap
  );
  const mine = s.userId === userId && !!userId;
  return {
    loaded: mine && s.loaded,
    prompted: (q: QuarterId) => mine && !!s.flags.prompted[q],
    seen: (q: QuarterId) => mine && !!s.flags.seen[q],
    markPrompted: (q: QuarterId) => mark("prompted", q),
    markSeen: (q: QuarterId) => mark("seen", q),
  };
}

/** 지난 분기 리캡 목록과 막 끝난 분기 리캡(캘린더 카드·초대장 대상). */
export function useRecaps() {
  const { data: rows, isSuccess } = useRows();
  const list = useMemo(() => (rows ? listRecapQuarters(rows) : []), [rows]);
  const latest = useMemo(() => (rows ? latestRecap(rows) : null), [rows]);
  return { ready: isSuccess, list, latest };
}

/** 캘린더 탭 아이콘의 점 — 막 끝난 분기 리캡을 아직 끝까지 보지 않았을 때. */
export function useRecapUnseen() {
  const { latest } = useRecaps();
  const state = useRecapState();
  return !!latest && state.loaded && !state.seen(latest.quarter);
}

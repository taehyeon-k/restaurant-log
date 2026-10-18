import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/data/session";
import { useAccount } from "@/data/profile";
import type { AnniversaryPick } from "@/lib/anniversary";
import { DEFAULT_CHARACTER, isCharacterId, type CharacterId } from "@/lib/characters";
import { supabase } from "@/lib/supabase";

/**
 * 기록장(HANDOFF-couple.md §1·§3-1) — 개인 기록 / 연인 기록. 지도·시트·캘린더·기념일·촬영 저장 위치는
 * 모두 지금 고른 기록장(activeBookId) 기준입니다. 고른 값은 AsyncStorage `activeBookId:{userId}` 에 둡니다.
 */

export type BookMember = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  /** 대표 캐릭터 — 연인계정 「만난 지」 카드에 둘이 나란히(HANDOFF-couple-account §3). 바꾸기는 개인 내계정에서만. */
  characterId?: CharacterId;
};

export type Book = {
  id: string;
  kind: "personal" | "couple";
  startedOn: string | null;
  createdBy: string;
  closedAt: string | null;
  members: BookMember[];
};

export type Books = {
  personal: Book | null;
  /** 열린 연인 기록장, 없으면 가장 최근에 끊긴 것 */
  couple: Book | null;
  all: Book[];
};

/** 나 = 벽돌색, 상대 = 청회색. */
export const ME_COLOR = "#b4552d";
export const PARTNER_COLOR = "#4f6b7a";
export const EMPTY_AVATAR = "#cfc8ba";

export const useBooks = () => {
  const session = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["books", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Books> => {
      const { data, error } = await supabase
        .from("books")
        .select("id, kind, started_on, created_by, closed_at, created_at, book_members(user_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).flatMap((b) => (b.book_members as { user_id: string }[]).map((m) => m.user_id)))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, nickname, avatar_url, character_id").in("id", ids)
        : { data: [] as { id: string; nickname: string | null; avatar_url: string | null; character_id: string | null }[] };
      const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      const all: Book[] = (data ?? []).map((b) => ({
        id: b.id,
        kind: b.kind,
        startedOn: b.started_on,
        createdBy: b.created_by,
        closedAt: b.closed_at,
        members: (b.book_members as { user_id: string }[]).map((m) => ({
          userId: m.user_id,
          nickname: byId.get(m.user_id)?.nickname?.trim() || "이름 없음",
          avatarUrl: byId.get(m.user_id)?.avatar_url ?? null,
          characterId: isCharacterId(byId.get(m.user_id)?.character_id) ? (byId.get(m.user_id)!.character_id as CharacterId) : DEFAULT_CHARACTER,
        })),
      }));
      if (!all.some((b) => b.kind === "personal")) throw new Error("personal_book_missing");
      return {
        personal: all.find((b) => b.kind === "personal") ?? null,
        couple: all.find((b) => b.kind === "couple" && !b.closedAt) ?? all.find((b) => b.kind === "couple") ?? null,
        all,
      };
    },
  });
};

/* ───────────── 지금 고른 기록장 ───────────── */

type Snap = { userId: string | null; loaded: boolean; id: string | null };
let snap: Snap = { userId: null, loaded: false, id: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const storeKey = (userId: string) => `activeBookId:${userId}`;

function load(userId: string) {
  if (snap.userId === userId) return;
  snap = { userId, loaded: false, id: null };
  emit();
  AsyncStorage.getItem(storeKey(userId))
    .catch(() => null)
    .then((id) => {
      if (snap.userId !== userId) return;
      snap = { userId, loaded: true, id };
      emit();
    });
}

/** 기록장 바꾸기 — 지도 머리 메뉴(BookDrawer)가 부릅니다. */
export function setActiveBook(id: string) {
  const { userId } = snap;
  if (!userId) return;
  snap = { ...snap, id };
  emit();
  AsyncStorage.setItem(storeKey(userId), id).catch(() => {});
}

export type ActiveBook = {
  /** 기록장 정보를 다 읽었는지 — 이 전에는 기록을 읽지 않습니다(다른 기록장이 잠깐 비치지 않게). */
  ready: boolean;
  error: boolean;
  /** Resolved book only; null disables book-scoped queries. */
  id: string | null;
  book: Book | null;
  books: Books | null;
  /** 지금이 연인 기록장인지 */
  isCouple: boolean;
  /** 연인 기록장이 끊겨 읽기만 되는지 */
  readOnly: boolean;
  me: BookMember | null;
  partner: BookMember | null;
};

export function useActiveBook(): ActiveBook {
  const { data: account } = useAccount();
  const session = useSession();
  const userId = session?.user.id ?? null;
  useEffect(() => { if (userId) load(userId); }, [userId]);
  const s = useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => snap,
    () => snap
  );
  const { data: books, isSuccess, isError } = useBooks();
  const loaded = s.userId === userId && s.loaded;
  const ready = !!userId && loaded && isSuccess;
  const picked = books?.all.find((b) => b.id === s.id && (b.kind === "personal" || b.id === books.couple?.id));
  const book = picked ?? books?.personal ?? null;
  useEffect(() => {
    if (ready && book?.id && userId) void AsyncStorage.setItem(storeKey(userId), book.id).catch(() => {});
  }, [ready, book?.id, userId]);
  const isCouple = book?.kind === "couple";
  const me = book?.members.find((m) => m.userId === userId) ?? (userId ? { userId, nickname: account?.nickname || "나", avatarUrl: account?.avatarUrl ?? null, characterId: account?.characterId ?? DEFAULT_CHARACTER } : null);
  const partner = isCouple ? book!.members.find((m) => m.userId !== userId) ?? null : null;
  return { ready, error: isError, id: book?.id ?? null, book, books: books ?? null, isCouple, readOnly: isCouple && !!book?.closedAt, me, partner };
}

/** 개인 기록장 id — 라벨·캐릭터·리캡은 개인 기록으로만 셉니다. */
export function usePersonalBook() {
  const { data: books, isSuccess, isError } = useBooks();
  return { ready: isSuccess && !!books?.personal?.id, error: isError, id: books?.personal?.id ?? null };
}

/* ───────────── 만들기 · 초대 · 참여 · 끊기 ───────────── */

export type Invite = { book_id: string; code: string; expires_at: string };

const ERRORS: Record<string, string> = {
  invite_not_found: "없는 코드예요. 다시 확인해 주세요",
  invite_used: "이미 쓰인 코드예요",
  invite_expired: "기한이 지난 코드예요. 새 코드를 받아 주세요",
  invite_own: "내가 만든 코드예요. 상대에게 보내 주세요",
  book_full: "이미 두 사람이 함께 쓰는 기록장이에요",
  already_in_couple: "이미 함께 쓰는 연인 기록장이 있어요. 먼저 연결을 끊어 주세요",
  bad_date: "사귄 날을 다시 골라 주세요",
  not_member: "이 기록장에 들어 있지 않아요",
  not_my_record: "내가 찍은 기록만 남길 수 있어요",
  pending_record: "보관함 기록은 먼저 저장해 주세요",
  not_couple_record: "연인 기록에서만 쓸 수 있어요",
  not_found: "기록을 찾지 못했어요",
};

const friendly = (message: string) => {
  const hit = Object.keys(ERRORS).find((k) => message.includes(k));
  return new Error(hit ? ERRORS[hit] : message);
};

/** 화면 표기 — 4K7Q2M → 4K7Q·2M */
export const formatCode = (code: string) => (code.length > 4 ? `${code.slice(0, 4)}·${code.slice(4)}` : code);
export const cleanCode = (code: string) => code.replace(/[^0-9a-z]/gi, "").toUpperCase();

export async function createCoupleBook(startedOn: string): Promise<Invite> {
  const { data, error } = await supabase.rpc("create_couple_book", { p_started_on: startedOn });
  if (error) throw friendly(error.message);
  return data as Invite;
}

export async function renewInvite(bookId: string): Promise<Invite> {
  const { data, error } = await supabase.rpc("renew_book_invite", { p_book: bookId });
  if (error) throw friendly(error.message);
  return data as Invite;
}

/** 아직 쓰이지 않은 가장 최근 코드(만료됐을 수도 있음). 만든 사람만 읽힙니다. */
export async function latestInvite(bookId: string): Promise<Invite | null> {
  const { data } = await supabase
    .from("book_invites")
    .select("book_id, code, expires_at")
    .eq("book_id", bookId)
    .is("used_by", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as Invite | undefined) ?? null;
}

export type InvitePeek = {
  code: string;
  book_id: string;
  started_on: string;
  inviter: { id: string; nickname: string | null; avatar_url: string | null };
};

export async function peekInvite(code: string): Promise<InvitePeek> {
  const { data, error } = await supabase.rpc("peek_book_invite", { p_code: cleanCode(code) });
  if (error) throw friendly(error.message);
  return data as InvitePeek;
}

export async function joinBook(qc: QueryClient, code: string) {
  const { data, error } = await supabase.rpc("join_book", { p_code: cleanCode(code) });
  if (error) throw friendly(error.message);
  await qc.invalidateQueries({ queryKey: ["books"] });
  setActiveBook(data as string);
}

export async function closeBook(qc: QueryClient, bookId: string) {
  const { error } = await supabase.rpc("close_book", { p_book: bookId });
  if (error) throw friendly(error.message);
  await qc.invalidateQueries({ queryKey: ["books"] });
}

export async function updateStartedOn(qc: QueryClient, bookId: string, startedOn: string) {
  const { error } = await supabase.from("books").update({ started_on: startedOn }).eq("id", bookId);
  if (error) throw friendly(error.message);
  await qc.invalidateQueries({ queryKey: ["books"] });
}

/* ───────────── 사람별 한 줄 · 기념일 식사 ───────────── */

export type RecordNote = { record_id: number; user_id: string; rating: number | null; note: string | null; updated_at: string };

/** 연인 기록장의 모든 한 줄 — 지도 카드 상태(「둘 다 썼어요」)와 기록 화면이 함께 씁니다. */
export function useRecordNotes() {
  const { id, isCouple } = useActiveBook();
  return useQuery({
    queryKey: ["record_notes", id],
    enabled: isCouple && !!id,
    queryFn: async (): Promise<RecordNote[]> => {
      const { data, error } = await supabase
        .from("record_notes")
        .select("record_id, user_id, rating, note, updated_at, restaurants!inner(book_id)")
        .eq("restaurants.book_id", id!);
      if (error) {
        console.error("record_notes 조회 실패:", error.message);
        return [];
      }
      return (data ?? []).map(({ restaurants: _r, ...n }) => ({ ...n, rating: n.rating == null ? null : Number(n.rating) })) as RecordNote[];
    },
  });
}

export function useSaveNote() {
  const qc = useQueryClient();
  return async (userId: string, recordId: number, rating: number | null, note: string | null, alsoRecord: boolean) => {
    const { error } = await supabase
      .from("record_notes")
      .upsert({ record_id: recordId, user_id: userId, rating, note, updated_at: new Date().toISOString() });
    if (error) throw friendly(error.message);
    // 찍은 사람의 한 줄은 기록 자체의 별점·메모와도 맞춰 둡니다(지도 별점·정렬이 기록의 값을 씁니다).
    if (alsoRecord) {
      await supabase.from("restaurants").update({ rating, review: note, updated_at: new Date().toISOString() }).eq("id", recordId);
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["record_notes"] }),
      alsoRecord ? qc.invalidateQueries({ queryKey: ["restaurants"] }) : null,
    ]);
  };
}

export function useAnniversaryPicks() {
  const { id, isCouple } = useActiveBook();
  return useQuery({
    queryKey: ["anniversary_picks", id],
    enabled: isCouple && !!id,
    queryFn: async (): Promise<AnniversaryPick[]> => {
      const { data, error } = await supabase.from("anniversary_picks").select("milestone, record_id, cleared").eq("book_id", id!);
      if (error) {
        console.error("anniversary_picks 조회 실패:", error.message);
        return [];
      }
      return (data ?? []) as AnniversaryPick[];
    },
  });
}

export async function savePick(qc: QueryClient, bookId: string, milestone: string, pick: { record_id: number | null; cleared: boolean }) {
  const { error } = await supabase
    .from("anniversary_picks")
    .upsert({ book_id: bookId, milestone, ...pick, updated_at: new Date().toISOString() });
  if (error) throw friendly(error.message);
  await qc.invalidateQueries({ queryKey: ["anniversary_picks"] });
}

/* ───────────── 내 기록에도 남기기 ───────────── */

/** 내가 찍은 연인 기록을 개인 기록장에 복사본으로 남깁니다. 이미 있으면 그 복사본 id 를 돌려줍니다. */
export async function copyToPersonal(qc: QueryClient, recordId: number): Promise<number> {
  const { data, error } = await supabase.rpc("copy_record_to_personal", { p_record: recordId });
  if (error) throw friendly(error.message);
  await qc.invalidateQueries({ queryKey: ["restaurants"] });
  return data as number;
}

/** Local-only capture fallback: never require a network lookup to enqueue a photo. */
export async function captureBookId(userId: string, resolved: string | null) {
  return resolved ?? await AsyncStorage.getItem(storeKey(userId)).catch(() => null);
}

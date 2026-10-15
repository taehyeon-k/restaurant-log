import { useQuery, type QueryClient } from "@tanstack/react-query";
import { refreshAll } from "@/data/invalidate";
import { DEFAULT_CHARACTER, isCharacterId, type CharacterId } from "@/lib/characters";
import { supabase } from "@/lib/supabase";
import { coverPhoto, matchWish, type Kind, type Wish } from "@/lib/types";

/**
 * 커뮤니티 데이터 — supabase/migrations/20261015000100_community.sql 의 표 · 뷰 · 함수를 읽습니다.
 * 남의 기록은 restaurants 가 아니라 friend_feed / shared_records / board_feed / board_answer_rows 뷰로만 옵니다.
 */

export type PublicProfile = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  characterId: CharacterId;
  titleLabelId: string | null;
  leaderboardOptIn: boolean;
};

type ProfileRow = { id: string; nickname: string | null; avatar_url: string | null; character_id: string | null; title_label_id: string | null; leaderboard_opt_in?: boolean | null };

const toProfile = (p: ProfileRow): PublicProfile => ({
  id: p.id,
  nickname: p.nickname ?? "",
  avatarUrl: p.avatar_url,
  characterId: isCharacterId(p.character_id) ? p.character_id : DEFAULT_CHARACTER,
  titleLabelId: p.title_label_id,
  leaderboardOptIn: p.leaderboard_opt_in === true,
});

async function myId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** 마이그레이션 전이면 표가 없다고 나옵니다 — 화면이 비지 않고 빈 목록으로 보이게 합니다. */
function soft<T>(what: string, error: { message: string } | null, value: T): T {
  if (error) console.error(`${what} 실패 — 커뮤니티 마이그레이션(20261015000100)을 적용했는지 확인하세요:`, error.message);
  return value;
}

/* ───────────── 친구 ───────────── */

export type Friends = { me: string | null; friends: PublicProfile[]; incoming: PublicProfile[]; outgoing: PublicProfile[] };

export const useFriends = () =>
  useQuery({
    queryKey: ["community", "friends"],
    queryFn: async (): Promise<Friends> => {
      const me = await myId();
      const empty: Friends = { me, friends: [], incoming: [], outgoing: [] };
      if (!me) return empty;
      const { data, error } = await supabase.from("friendships").select("user_id, friend_id, status");
      const rows = soft("friendships 조회", error, (data ?? []) as { user_id: string; friend_id: string; status: string }[]);
      const other = (r: (typeof rows)[number]) => (r.user_id === me ? r.friend_id : r.user_id);
      const ids = [...new Set(rows.map(other))];
      if (!ids.length) return empty;
      const { data: ps } = await supabase.from("public_profiles").select("*").in("id", ids);
      const byId = new Map(((ps ?? []) as ProfileRow[]).map((p) => [p.id, toProfile(p)]));
      const pick = (f: (r: (typeof rows)[number]) => boolean) =>
        rows.filter(f).map((r) => byId.get(other(r))).filter((p): p is PublicProfile => !!p);
      return {
        me,
        friends: pick((r) => r.status === "accepted"),
        incoming: pick((r) => r.status === "pending" && r.friend_id === me),
        outgoing: pick((r) => r.status === "pending" && r.user_id === me),
      };
    },
  });

/** 닉네임으로 찾기 — 나와 이미 친구 · 신청 중인 사람도 함께 돌려주고 화면이 상태를 붙입니다. */
export async function searchPeople(q: string): Promise<PublicProfile[]> {
  const needle = q.trim().replace(/[%_,()]/g, "");
  if (needle.length < 1) return [];
  const me = await myId();
  const { data, error } = await supabase.from("public_profiles").select("*").ilike("nickname", `%${needle}%`).limit(20);
  return soft("닉네임 검색", error, ((data ?? []) as ProfileRow[]).filter((p) => p.id !== me).map(toProfile));
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const { data } = await supabase.from("public_profiles").select("*").eq("id", id).maybeSingle();
  return data ? toProfile(data as ProfileRow) : null;
}

/** 친구 신청 — 상대가 먼저 신청해 두었으면 그걸 받아들입니다. */
export async function requestFriend(qc: QueryClient, otherId: string) {
  const me = await myId();
  if (!me || me === otherId) return;
  const { data: back } = await supabase.from("friendships").select("status").eq("user_id", otherId).eq("friend_id", me).maybeSingle();
  const { error } = back
    ? await supabase.from("friendships").update({ status: "accepted" }).eq("user_id", otherId).eq("friend_id", me)
    : await supabase.from("friendships").insert({ user_id: me, friend_id: otherId });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community"] });
}

export async function acceptFriend(qc: QueryClient, otherId: string) {
  const me = await myId();
  const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("user_id", otherId).eq("friend_id", me!);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community"] });
}

/** 신청 거절 · 취소 · 친구 끊기 — 어느 쪽 줄이든 지웁니다. */
export async function removeFriend(qc: QueryClient, otherId: string) {
  const me = await myId();
  if (!me) return;
  await supabase.from("friendships").delete().or(`and(user_id.eq.${me},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${me})`);
  await qc.invalidateQueries({ queryKey: ["community"] });
}

/* ───────────── 남의 기록(친구 소식 · 추천 · 친구 지도) ───────────── */

export type SharedRecord = {
  id: number;
  user_id: string;
  kind: Kind;
  name: string;
  category: string | null;
  region: string | null;
  address: string | null;
  rating: number | null;
  review: string | null;
  visited_at: string | null;
  created_at: string;
  verified: boolean;
  verified_at: string | null;
  photo_urls: string[];
  cover_index: number;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  place_key: string | null;
  visibility: "friends" | "public";
  place: string;
  by_friend: boolean;
};

export const useSharedRecords = () =>
  useQuery({
    queryKey: ["community", "shared"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_records").select("*").order("created_at", { ascending: false }).limit(400);
      return soft("shared_records 조회", error, (data ?? []) as SharedRecord[]);
    },
  });

/* ───────────── 친구 소식(직접 올리기 · HANDOFF-friend-posts) ───────────── */

export type Audience = "friends" | "close";

/** friend_feed 한 줄 — 내가 고른 기록 + 보여도 되는 칸. 기록의 메모(review)는 오지 않습니다. */
export type FriendPost = {
  id: number;
  user_id: string;
  record_id: number;
  photo_index: number[];
  note: string | null;
  audience: Audience;
  created_at: string;
  updated_at: string;
  name: string;
  category: string | null;
  region: string | null;
  address: string | null;
  rating: number | null;
  verified_at: string | null;
  photo_urls: string[];
  cover_index: number;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  place: string;
};

/** 소식에 보일 사진 — 고른 순서대로, 고른 게 없으면 대표 사진 한 장. */
export function postPhotos(p: Pick<FriendPost, "photo_index" | "photo_urls" | "cover_index" | "photo_url">): string[] {
  const picked = (p.photo_index ?? []).map((i) => p.photo_urls?.[i]).filter((u): u is string => !!u);
  if (picked.length) return picked;
  const cover = coverPhoto(p);
  return cover ? [cover] : [];
}

export const useFriendFeed = () =>
  useQuery({
    queryKey: ["community", "feed"],
    queryFn: async () => {
      const { data, error } = await supabase.from("friend_feed").select("*").order("created_at", { ascending: false }).limit(400);
      return soft("friend_feed 조회", error, (data ?? []) as FriendPost[]);
    },
  });

export type PostInput = { recordId: number; photoIndex: number[]; note: string; audience: Audience };

/** 올리기 · 고치기 — 같은 기록이면 새 소식이 아니라 고치기입니다(unique user_id, record_id). */
export async function upsertFriendPost(qc: QueryClient, p: PostInput): Promise<number> {
  const { data, error } = await supabase.rpc("upsert_friend_post", {
    p_record_id: p.recordId, p_photo_index: p.photoIndex, p_note: stripContact(p.note).trim() || null, p_audience: p.audience,
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "feed"] });
  return Number(data);
}

/** 소식에서 내리기 — 기록(restaurants)은 그대로입니다. */
export async function removeFriendPost(qc: QueryClient, id: number) {
  const { error } = await supabase.from("friend_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "feed"] });
}

/** 내가 고른 친한 친구 id. */
export const useCloseFriends = () =>
  useQuery({
    queryKey: ["community", "close"],
    queryFn: async () => {
      const { data, error } = await supabase.from("close_friends").select("friend_id");
      return soft("close_friends 조회", error, ((data ?? []) as { friend_id: string }[]).map((r) => r.friend_id));
    },
  });

/** 친한 친구를 통째로 바꿉니다. */
export async function setCloseFriends(qc: QueryClient, ids: string[]) {
  const me = await myId();
  if (!me) return;
  const { error: delErr } = await supabase.from("close_friends").delete().eq("user_id", me);
  if (delErr) throw new Error(delErr.message);
  if (ids.length) {
    const { error } = await supabase.from("close_friends").insert(ids.map((friend_id) => ({ user_id: me, friend_id })));
    if (error) throw new Error(error.message);
  }
  await qc.invalidateQueries({ queryKey: ["community", "close"] });
}

/** 공감 · 댓글 수와 내가 공감했는지. */
export const useRecordSocial = (ids: number[]) =>
  useQuery({
    queryKey: ["community", "social", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const me = await myId();
      const [{ data: cheers }, { data: comments }] = await Promise.all([
        supabase.from("record_cheers").select("record_id, user_id").in("record_id", ids),
        supabase.from("record_comments").select("record_id").in("record_id", ids),
      ]);
      const out = new Map<number, { cheers: number; mine: boolean; comments: number }>();
      for (const id of ids) out.set(id, { cheers: 0, mine: false, comments: 0 });
      for (const c of (cheers ?? []) as { record_id: number; user_id: string }[]) {
        const o = out.get(c.record_id)!;
        o.cheers += 1;
        if (c.user_id === me) o.mine = true;
      }
      for (const c of (comments ?? []) as { record_id: number }[]) out.get(c.record_id)!.comments += 1;
      return out;
    },
  });

export async function toggleCheer(qc: QueryClient, recordId: number, on: boolean) {
  const me = await myId();
  if (!me) return;
  const { error } = on
    ? await supabase.from("record_cheers").insert({ record_id: recordId, user_id: me })
    : await supabase.from("record_cheers").delete().eq("record_id", recordId).eq("user_id", me);
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "social"] });
}

export type Comment = { id: number; record_id: number; user_id: string; body: string; created_at: string; nickname: string | null; avatar_url: string | null; character_id: string | null };

export const useComments = (recordId: number | null) =>
  useQuery({
    queryKey: ["community", "comments", recordId],
    enabled: recordId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("record_comment_rows").select("*").eq("record_id", recordId!).order("created_at");
      return soft("댓글 조회", error, (data ?? []) as Comment[]);
    },
  });

export async function addComment(qc: QueryClient, recordId: number, body: string) {
  const me = await myId();
  const text = stripContact(body).trim().slice(0, 120);
  if (!me || !text) return;
  const { error } = await supabase.from("record_comments").insert({ record_id: recordId, user_id: me, body: text });
  if (error) throw new Error(error.message.includes("check") ? "링크 · 연락처는 넣을 수 없습니다" : error.message);
  await qc.invalidateQueries({ queryKey: ["community", "comments", recordId] });
  await qc.invalidateQueries({ queryKey: ["community", "social"] });
}

/** 탭바 커뮤니티 점 — 마지막으로 본 뒤 친구가 올린 소식 수(friend_feed). */
export const useCommunityUnseen = (enabled = true) =>
  useQuery({
    queryKey: ["community", "unseen"],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("community_unseen");
      if (error) return 0;
      return Number(data) || 0;
    },
  });

/** 커뮤니티에 들어올 때 — 지난번 본 시각을 남겨 두고(친구 줄 테두리용) 지금으로 바꿉니다. */
export async function markCommunitySeen(qc: QueryClient): Promise<string | null> {
  const me = await myId();
  if (!me) return null;
  const { data } = await supabase.from("profiles").select("last_seen_community_at").eq("id", me).maybeSingle();
  await supabase.from("profiles").update({ last_seen_community_at: new Date().toISOString() }).eq("id", me);
  qc.setQueryData(["community", "unseen"], 0);
  return (data?.last_seen_community_at as string | null | undefined) ?? null;
}

/* ───────────── 위시에 담기 ───────────── */

export type WishSeed = { name: string; where_text?: string | null; category?: string | null; lat?: number | null; lng?: number | null; source?: string };

/**
 * 위시에 담기 — 그 기록장(bookId, 없으면 개인 기록장)에 같은 이름이 이미 있으면 "exists".
 * 출처(「민지의 기록」)는 메모 첫 줄에 남깁니다. 연인 기록장이 있으면 화면이 useAddWish 로 어느 쪽인지 먼저 묻습니다.
 */
export async function addWishFrom(qc: QueryClient, seed: WishSeed, bookId: string | null = null): Promise<"added" | "exists"> {
  const me = await myId();
  if (!me) throw new Error("로그인이 필요합니다");
  let q = supabase.from("wishes").select("id, name");
  q = bookId ? q.eq("book_id", bookId) : q.eq("user_id", me);
  const { data: existing } = await q;
  if (matchWish((existing ?? []) as Wish[], seed.name)) return "exists";
  const { error } = await supabase.from("wishes").insert({
    ...(bookId ? { book_id: bookId } : {}),
    user_id: me,
    name: seed.name,
    where_text: seed.where_text ?? null,
    category: seed.category ?? null,
    lat: seed.lat ?? null,
    lng: seed.lng ?? null,
    note: seed.source ?? null,
  });
  if (error) throw new Error(error.message);
  await refreshAll(qc);
  return "added";
}

/* ───────────── 랭킹 ───────────── */

export type Period = "week" | "month" | "quarter";
export type Scope = "friends" | "all";
export type BoardId = "verified" | "explorer" | "regular" | "district" | "streak" | `category:${string}`;

export type RankRow = { user_id: string; nickname: string; avatar_url: string | null; character_id: string | null; title_label_id: string | null; value: number; rank: number };

export const useLeaderboard = (board: BoardId, period: Period, scope: Scope) =>
  useQuery({
    queryKey: ["community", "leaderboard", board, period, scope],
    queryFn: async () => {
      const [b, category] = board.startsWith("category:") ? ["category", board.slice(9)] : [board, null];
      const { data, error } = await supabase.rpc("leaderboard", { p_board: b, p_period: period, p_scope: scope, p_category: category });
      return soft("leaderboard", error, (data ?? []) as RankRow[]);
    },
  });

/* ───────────── 게시판 ───────────── */

export type PostType = "record_share" | "theme_answer" | "ask";

export type BoardPost = {
  id: number;
  type: PostType;
  author_id: string;
  note: string | null;
  created_at: string;
  theme_id: number | null;
  ask_area: string | null;
  ask_tags: string[];
  area: string | null;
  nickname: string | null;
  avatar_url: string | null;
  character_id: string | null;
  title_label_id: string | null;
  place_name: string | null;
  kind: Kind | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  photo_urls: string[] | null;
  cover_index: number | null;
  photo_url: string | null;
  verified_at: string | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
  want_count: number;
  been_count: number;
  my_want: boolean;
  my_been: boolean;
  answer_count: number;
  top_answer: string | null;
};

export type Theme = { id: number; title: string; starts_on: string; ends_on: string };

const seoulToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

export const useCurrentTheme = () =>
  useQuery({
    queryKey: ["community", "theme"],
    queryFn: async () => {
      const today = seoulToday();
      const { data, error } = await supabase.from("board_themes").select("*").lte("starts_on", today).gte("ends_on", today).order("starts_on", { ascending: false }).limit(1);
      const theme = soft("board_themes 조회", error, ((data ?? [])[0] as Theme | undefined) ?? null);
      if (!theme) return null;
      const { count } = await supabase.from("board_posts").select("id", { count: "exact", head: true }).eq("theme_id", theme.id);
      const daysLeft = Math.max(0, Math.round((Date.parse(theme.ends_on) - Date.parse(today)) / 86400000));
      return { ...theme, count: count ?? 0, daysLeft };
    },
  });

export const useBoardFeed = (type: PostType | null, area: string | null) =>
  useQuery({
    queryKey: ["community", "board", type, area],
    queryFn: async () => {
      let q = supabase.from("board_feed").select("*").order("created_at", { ascending: false }).limit(60);
      if (type) q = q.eq("type", type);
      if (area) q = q.eq("area", area);
      const { data, error } = await q;
      return soft("board_feed 조회", error, (data ?? []) as BoardPost[]);
    },
  });

export const useBoardPost = (id: number) =>
  useQuery({
    queryKey: ["community", "board", "post", id],
    queryFn: async () => {
      const { data } = await supabase.from("board_feed").select("*").eq("id", id).maybeSingle();
      return (data as BoardPost | null) ?? null;
    },
  });

export type AnswerRow = {
  id: number; post_id: number; author_id: string; reason: string | null; created_at: string;
  nickname: string | null; avatar_url: string | null; character_id: string | null; title_label_id: string | null;
  place_name: string; kind: Kind; category: string | null; address: string | null; lat: number | null; lng: number | null; verified_at: string | null; place: string;
};

/** 같은 가게를 고른 답을 하나로 묶고, 많이 고른 순으로. */
export type AnswerGroup = { place: string; first: AnswerRow; picks: number; answers: AnswerRow[] };

export const useAnswers = (postId: number) =>
  useQuery({
    queryKey: ["community", "board", "answers", postId],
    queryFn: async (): Promise<AnswerGroup[]> => {
      const { data, error } = await supabase.from("board_answer_rows").select("*").eq("post_id", postId).order("created_at");
      const rows = soft("board_answer_rows 조회", error, (data ?? []) as AnswerRow[]);
      const groups = new Map<string, AnswerGroup>();
      for (const r of rows) {
        const g = groups.get(r.place);
        if (g) { g.picks += 1; g.answers.push(r); } else groups.set(r.place, { place: r.place, first: r, picks: 1, answers: [r] });
      }
      return [...groups.values()].sort((a, b) => b.picks - a.picks);
    },
  });

export async function setReaction(qc: QueryClient, postId: number, kind: "want" | "been", on: boolean) {
  const me = await myId();
  if (!me) return;
  const { error } = on
    ? await supabase.from("board_reactions").insert({ post_id: postId, user_id: me, kind })
    : await supabase.from("board_reactions").delete().eq("post_id", postId).eq("user_id", me).eq("kind", kind);
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

/** 서버 오류 코드를 사람 말로. */
export const BOARD_ERRORS: Record<string, string> = {
  need_5_verified: "인증 기록 5건부터 올릴 수 있습니다",
  daily_limit: "하루 3개까지 올릴 수 있습니다",
  no_contact: "링크 · 연락처는 넣을 수 없습니다",
  record_not_verified: "인증 없는 기록은 고를 수 없습니다",
  theme_closed: "이번 주 주제가 끝났습니다",
  note_too_long: "글자 수를 넘었습니다",
  need_area: "동네를 골라 주세요",
};
const boardError = (msg: string) => BOARD_ERRORS[Object.keys(BOARD_ERRORS).find((k) => msg.includes(k)) ?? ""] ?? msg;

export async function createPost(qc: QueryClient, p: { type: PostType; recordId?: number; themeId?: number; askArea?: string; askTags?: string[]; area?: string | null; note?: string }) {
  const { data, error } = await supabase.rpc("create_board_post", {
    p_type: p.type, p_record_id: p.recordId ?? null, p_theme_id: p.themeId ?? null, p_ask_area: p.askArea ?? null,
    p_ask_tags: p.askTags ?? [], p_area: p.area ?? null, p_note: p.note ? stripContact(p.note) : null,
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
  await qc.invalidateQueries({ queryKey: ["community", "theme"] });
  return Number(data);
}

export async function answerPost(qc: QueryClient, postId: number, recordId: number, reason: string) {
  const { error } = await supabase.rpc("answer_board_post", { p_post_id: postId, p_record_id: recordId, p_reason: stripContact(reason) || null });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

/** 오늘(한국 날짜) 내가 올린 글 수 — 「하루 3개까지」 안내용. 서버가 한 번 더 막습니다. */
export const usePostsToday = () =>
  useQuery({
    queryKey: ["community", "board", "today"],
    queryFn: async () => {
      const me = await myId();
      if (!me) return 0;
      const since = new Date(`${seoulToday()}T00:00:00+09:00`).toISOString();
      const { count } = await supabase.from("board_posts").select("id", { count: "exact", head: true }).eq("author_id", me).gte("created_at", since);
      return count ?? 0;
    },
  });

/* ───────────── 신고 · 차단 ───────────── */

export async function report(targetType: "post" | "answer" | "comment" | "user", targetId: string | number, reason: string) {
  const me = await myId();
  const { error } = await supabase.from("reports").insert({ target_type: targetType, target_id: String(targetId), reporter_id: me, reason });
  if (error) throw new Error(error.message);
}

/** 숨기기 · 차단 — 그 사람의 기록 · 글 · 답이 내 화면에서 빠집니다. */
export async function blockUser(qc: QueryClient, otherId: string) {
  const me = await myId();
  if (!me) return;
  const { error } = await supabase.from("user_blocks").insert({ user_id: me, blocked_id: otherId });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community"] });
}

/* ───────────── 글 다듬기 ───────────── */

const URL_RE = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|gl|link)\b\S*|open\.kakao\S*)/gi;
const PHONE_RE = /0\d{1,2}[- .)]?\d{3,4}[- .]?\d{4}/g;

/** 링크 · 전화번호를 지웁니다(서버도 has_contact 로 한 번 더 막습니다). */
export const stripContact = (t: string) => t.replace(URL_RE, "").replace(PHONE_RE, "").replace(/\s{2,}/g, " ");
export const hasContact = (t: string) => new RegExp(URL_RE.source, "i").test(t) || new RegExp(PHONE_RE.source).test(t);


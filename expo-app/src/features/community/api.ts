import { useQuery, type QueryClient } from "@tanstack/react-query";
import { refreshAll } from "@/data/invalidate";
import { DEFAULT_CHARACTER, isCharacterId, type CharacterId } from "@/lib/characters";
import { supabase } from "@/lib/supabase";
import { coverPhoto, matchWish, type Kind, type Wish } from "@/lib/types";

/**
 * 커뮤니티 데이터 — supabase/migrations/20261015000100_community.sql 의 표 · 뷰 · 함수를 읽습니다.
 * 남의 기록은 restaurants 가 아니라 friend_feed / shared_records / board_feed / board_course_rows / board_comment_rows 뷰로만 옵니다.
 * 게시판 개편(투표 · 댓글 · 관리자)은 20261018200000_board_v2.sql.
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

/* ───────────── 게시판(HANDOFF-board-v2) ───────────── */

/** 다섯 칸 — 자유(투표 · 댓글) · 주제(공감) · 맛집 · 카페(가보고 싶어요 · 가봤어요) · 코스(통째로 담기). */
export type PostType = "free" | "theme" | "food" | "cafe" | "course";

export type BoardPost = {
  id: number;
  type: PostType;
  author_id: string;
  created_at: string;
  edited_at: string | null;
  theme_id: number | null;
  area: string | null;
  pinned: boolean;
  /** 관리자가 숨긴 글 — 목록에서 빠지고 상세는 「운영 정책에 따라 삭제된 글입니다」. 내용 칸은 관리자에게만 옵니다. */
  hidden_at: string | null;
  title: string | null;
  body: string | null;
  tags: string[];
  record_id: number | null;
  nickname: string | null;
  avatar_url: string | null;
  character_id: string | null;
  title_label_id: string | null;
  author_role: "user" | "admin";
  place_name: string | null;
  kind: Kind | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  photo_urls: string[] | null;
  cover_index: number | null;
  photo_url: string | null;
  verified: boolean | null;
  verified_at: string | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
  want_count: number;
  been_count: number;
  cheer_count: number;
  my_want: boolean;
  my_been: boolean;
  my_cheer: boolean;
  comment_count: number;
  course_count: number;
  course_verified: number;
  course_names: string[] | null;
  poll_total: number;
  poll_closes_at: string | null;
  my_vote: number | null;
};

export type Theme = { id: number; title: string; description: string | null; starts_on: string; ends_on: string };

const seoulToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const themeCount = async (id: number) =>
  (await supabase.from("board_posts").select("id", { count: "exact", head: true }).eq("theme_id", id).is("hidden_at", null)).count ?? 0;

export const useCurrentTheme = () =>
  useQuery({
    queryKey: ["community", "theme"],
    queryFn: async () => {
      const today = seoulToday();
      const { data, error } = await supabase.from("board_themes").select("*").lte("starts_on", today).gte("ends_on", today).order("starts_on", { ascending: false }).limit(1);
      const theme = soft("board_themes 조회", error, ((data ?? [])[0] as Theme | undefined) ?? null);
      if (!theme) return null;
      const daysLeft = Math.max(0, Math.round((Date.parse(theme.ends_on) - Date.parse(today)) / 86400000));
      return { ...theme, count: await themeCount(theme.id), daysLeft };
    },
  });

/** 지난 주제 — 「지난 주제 · OO · 답 N ›」 줄. */
export const useLastTheme = () =>
  useQuery({
    queryKey: ["community", "theme", "last"],
    queryFn: async () => {
      const { data } = await supabase.from("board_themes").select("*").lt("ends_on", seoulToday()).order("ends_on", { ascending: false }).limit(1);
      const theme = ((data ?? [])[0] as Theme | undefined) ?? null;
      return theme ? { ...theme, count: await themeCount(theme.id) } : null;
    },
  });

export type FeedFilter = { type: PostType | null; area: string | null; verifiedOnly: boolean; tag: string | null; themeId?: number | null; authorId?: string | null };

/** 목록 — 공지가 맨 위, 그다음 최신순. 숨긴 글은 뺍니다. */
export const useBoardFeed = (f: FeedFilter) =>
  useQuery({
    queryKey: ["community", "board", "feed", f],
    queryFn: async () => {
      let q = supabase.from("board_feed").select("*").is("hidden_at", null)
        .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(60);
      // 공지(pinned)는 어느 칸에서든 맨 위에.
      if (f.type) q = q.or(`type.eq.${f.type},pinned.is.true`);
      if (f.area) q = q.eq("area", f.area);
      if (f.verifiedOnly) q = q.eq("verified", true);
      if (f.tag) q = q.contains("tags", [f.tag]);
      if (f.themeId != null) q = q.eq("theme_id", f.themeId);
      if (f.authorId) q = q.eq("author_id", f.authorId);
      const { data, error } = await q;
      return soft("board_feed 조회", error, (data ?? []) as BoardPost[]);
    },
  });

export const useBoardPost = (id: number, enabled = true) =>
  useQuery({
    queryKey: ["community", "board", "post", id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from("board_feed").select("*").eq("id", id).maybeSingle();
      return (data as BoardPost | null) ?? null;
    },
  });

/** 요즘 많이 쓰인 태그(최근 7일) — 자유 칸 점선 칩 · 글쓰기 자동완성. */
export const usePopularTags = (limit = 10) =>
  useQuery({
    queryKey: ["community", "board", "tags", limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("board_popular_tags", { p_days: 7, p_limit: limit });
      return soft("board_popular_tags", error, ((data ?? []) as { tag: string; n: number }[]).map((t) => t.tag));
    },
  });

/* 코스 */

export type CourseStop = {
  post_id: number; position: number; memo: string | null; record_id: number;
  name: string; kind: Kind; category: string | null; address: string | null; lat: number | null; lng: number | null; rating: number | null;
  verified: boolean; verified_at: string | null; photo_urls: string[] | null; cover_index: number | null; photo_url: string | null; place: string;
};

/** 여러 코스 글의 가게를 한 번에 — 목록 카드 · 상세가 같이 씁니다. */
export const useCourseStops = (postIds: number[]) =>
  useQuery({
    queryKey: ["community", "board", "course", postIds.join(",")],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("board_course_rows").select("*").in("post_id", postIds).order("position");
      const rows = soft("board_course_rows 조회", error, (data ?? []) as CourseStop[]);
      const out = new Map<number, CourseStop[]>();
      for (const r of rows) out.set(r.post_id, [...(out.get(r.post_id) ?? []), r]);
      return out;
    },
  });

/* 투표 */

export type PollOption = { option_id: number; label: string; count: number | null; mine: boolean };

export const usePoll = (postId: number, enabled = true) =>
  useQuery({
    queryKey: ["community", "board", "poll", postId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("poll_results", { p_post_id: postId });
      return soft("poll_results", error, (data ?? []) as PollOption[]);
    },
  });

export async function votePoll(qc: QueryClient, postId: number, optionId: number) {
  const { error } = await supabase.rpc("vote_poll", { p_post_id: postId, p_option_id: optionId });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

/* 댓글 */

export type BoardComment = {
  id: number; post_id: number; parent_id: number | null; author_id: string; created_at: string; hidden_at: string | null;
  /** 숨긴 댓글이면 null(관리자는 그대로) */
  body: string | null;
  nickname: string | null; avatar_url: string | null; character_id: string | null; title_label_id: string | null; author_role: "user" | "admin";
  record_id: number | null; place_name: string | null; category: string | null; address: string | null; verified: boolean | null; verified_at: string | null;
  photo_urls: string[] | null; cover_index: number | null; photo_url: string | null; lat: number | null; lng: number | null;
};

/** 시간순 — 답글은 그 댓글 밑에. */
export const useBoardComments = (postId: number) =>
  useQuery({
    queryKey: ["community", "board", "comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase.from("board_comment_rows").select("*").eq("post_id", postId).order("created_at");
      const rows = soft("board_comment_rows 조회", error, (data ?? []) as BoardComment[]);
      const top = rows.filter((c) => c.parent_id == null);
      return top.map((c) => ({ ...c, replies: rows.filter((r) => r.parent_id === c.id) }));
    },
  });

export async function addBoardComment(qc: QueryClient, p: { postId: number; body: string; parentId?: number | null; recordId?: number | null }) {
  const { error } = await supabase.rpc("add_board_comment", {
    p_post_id: p.postId, p_body: stripContact(p.body).trim().slice(0, 500), p_parent_id: p.parentId ?? null, p_record_id: p.recordId ?? null,
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

export async function deleteBoardComment(qc: QueryClient, id: number) {
  const { error } = await supabase.from("board_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

/* 반응 */

export async function setReaction(qc: QueryClient, postId: number, kind: "want" | "been" | "cheer", on: boolean) {
  const me = await myId();
  if (!me) return;
  const { error } = on
    ? await supabase.from("board_reactions").insert({ post_id: postId, user_id: me, kind })
    : await supabase.from("board_reactions").delete().eq("post_id", postId).eq("user_id", me).eq("kind", kind);
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

/* 올리기 · 고치기 · 지우기 */

/** 서버 오류 코드를 사람 말로. */
export const BOARD_ERRORS: Record<string, string> = {
  need_5_verified: "인증 기록 5건부터 올릴 수 있습니다",
  daily_limit: "하루 3개까지 올릴 수 있습니다",
  no_contact: "링크 · 연락처는 넣을 수 없습니다",
  sanctioned: "운영 정책에 따라 지금은 글 · 댓글을 쓸 수 없습니다",
  theme_closed: "이번 주 주제가 끝났습니다",
  need_title: "제목을 적어 주세요",
  too_long: "글자 수를 넘었습니다",
  too_many_tags: "태그는 5개까지입니다",
  not_my_record: "내 기록만 붙일 수 있습니다",
  course_size: "코스는 2~5곳입니다",
  course_duplicate: "같은 기록을 두 번 넣을 수 없습니다",
  poll_free_only: "투표는 자유 게시판에서만 열 수 있습니다",
  poll_options: "선택지는 2~5개, 40자까지입니다",
  poll_closed: "마감된 투표입니다",
  one_level: "답글에는 답글을 달 수 없습니다",
  no_post: "지워진 글입니다",
  not_admin: "운영자만 할 수 있습니다",
  role_locked: "바꿀 수 없는 값입니다",
  already_posted: "이미 갤러리에 올린 사진입니다",
  not_my_photo: "내 기록의 사진만 올릴 수 있습니다",
};
const boardError = (msg: string) => BOARD_ERRORS[Object.keys(BOARD_ERRORS).find((k) => msg.includes(k)) ?? ""] ?? msg;

export type NewPost = {
  type: PostType; title: string; body?: string; tags?: string[]; recordId?: number | null;
  course?: { record_id: number; memo?: string }[]; themeId?: number | null; poll?: { options: string[]; days: number } | null;
  area?: string | null; pinned?: boolean;
};

export async function createPost(qc: QueryClient, p: NewPost) {
  const { data, error } = await supabase.rpc("create_board_post", {
    p_type: p.type, p_title: stripContact(p.title).trim(), p_body: p.body ? stripContact(p.body).trim() || null : null, p_tags: p.tags ?? [],
    p_record_id: p.recordId ?? null,
    p_course: p.course ? p.course.map((c) => ({ record_id: c.record_id, memo: c.memo ? stripContact(c.memo).trim() : null })) : null,
    p_theme_id: p.themeId ?? null, p_poll: p.poll ?? null, p_area: p.area ?? null, p_pinned: p.pinned ?? false,
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
  await qc.invalidateQueries({ queryKey: ["community", "theme"] });
  return Number(data);
}

export async function updatePost(qc: QueryClient, id: number, p: { title: string; body?: string; tags?: string[] }) {
  const { error } = await supabase.rpc("update_board_post", {
    p_id: id, p_title: stripContact(p.title).trim(), p_body: p.body ? stripContact(p.body).trim() || null : null, p_tags: p.tags ?? [],
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
}

export async function deletePost(qc: QueryClient, id: number) {
  const { error } = await supabase.from("board_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "board"] });
  await qc.invalidateQueries({ queryKey: ["community", "theme"] });
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

/* ───────────── 프로필 창 ───────────── */

export type FriendState = "self" | "friend" | "sent" | "received" | "none";

export type ProfileCard = {
  id: string; nickname: string; avatar_url: string | null; character_id: string | null; title_label_id: string | null; role: "user" | "admin";
  record_count: number; verified_count: number; post_count: number; friend_state: FriendState;
  /** 관리자에게만 — 정지 중이면 끝나는 때(영구면 "forever") */
  sanctioned_until: string | null;
  /** 관리자에게만 — 랭킹 정지 중이면 끝나는 때(영구 제외면 "forever") */
  rank_banned_until: string | null;
};

/** 닉네임을 누르면 여는 프로필 창. 차단한 사람이면 null. */
export const useProfileCard = (userId: string | null) =>
  useQuery({
    queryKey: ["community", "profile-card", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profile_card", { p_user: userId! });
      return soft("public_profile_card", error, (data as ProfileCard | null) ?? null);
    },
  });

/* ───────────── 관리자 ───────────── */

/** 내가 관리자인지 — 서버(is_admin)가 모든 관리자 동작에서 한 번 더 확인합니다. */
export const useIsAdmin = () =>
  useQuery({
    queryKey: ["community", "is-admin"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });

async function adminRpc(qc: QueryClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community"] });
  return data;
}

export const adminHidePost = (qc: QueryClient, id: number, hide: boolean) => adminRpc(qc, "admin_hide_post", { p_id: id, p_hide: hide });
export const adminHideComment = (qc: QueryClient, id: number, hide: boolean) => adminRpc(qc, "admin_hide_comment", { p_id: id, p_hide: hide });
export const adminPinPost = (qc: QueryClient, id: number, pin: boolean) => adminRpc(qc, "admin_pin_post", { p_id: id, p_pin: pin });
/** days 가 null 이면 영구 정지. */
export const adminSanction = (qc: QueryClient, userId: string, days: number | null, reason?: string) =>
  adminRpc(qc, "admin_sanction", { p_user: userId, p_until: days == null ? null : new Date(Date.now() + days * 86400000).toISOString(), p_reason: reason ?? null });
export const adminUnsanction = (qc: QueryClient, userId: string) => adminRpc(qc, "admin_unsanction", { p_user: userId });

/** 랭킹 정지 · 제외 — 기록장 · 게시판은 그대로, 랭킹에만 안 나옵니다. days 가 null 이면 영구 제외. */
export const adminRankBan = (qc: QueryClient, userId: string, days: number | null, reason?: string) =>
  adminRpc(qc, "admin_rank_ban", { p_user: userId, p_until: days == null ? null : new Date(Date.now() + days * 86400000).toISOString(), p_reason: reason ?? null });
export const adminRankUnban = (qc: QueryClient, userId: string) => adminRpc(qc, "admin_rank_unban", { p_user: userId });

export type RankBan = { user_id: string; until: string | null; reason: string | null; created_at: string; nickname: string | null; avatar_url: string | null };

/** 지금 랭킹에서 빠져 있는 사람 — 운영 화면에서 풉니다. 관리자만 읽힙니다(RLS). */
export const useRankBans = (enabled: boolean) =>
  useQuery({
    queryKey: ["community", "admin", "rank-bans"],
    enabled,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("leaderboard_sanctions").select("user_id, until, reason, created_at")
        .or(`until.is.null,until.gt.${now}`).order("created_at", { ascending: false });
      const rows = soft("leaderboard_sanctions 조회", error, (data ?? []) as Omit<RankBan, "nickname" | "avatar_url">[]);
      if (!rows.length) return [] as RankBan[];
      const { data: ps } = await supabase.from("public_profiles").select("id, nickname, avatar_url").in("id", rows.map((r) => r.user_id));
      const byId = new Map(((ps ?? []) as { id: string; nickname: string; avatar_url: string | null }[]).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, nickname: byId.get(r.user_id)?.nickname ?? null, avatar_url: byId.get(r.user_id)?.avatar_url ?? null }));
    },
  });
export const adminResolveReport = (qc: QueryClient, id: number, note?: string) => adminRpc(qc, "admin_resolve_report", { p_id: id, p_note: note ?? null });
export const adminCreateNotice = (qc: QueryClient, title: string, body: string, days: number | null) =>
  adminRpc(qc, "admin_create_notice", { p_title: title, p_body: body || null, p_ends_at: days == null ? null : new Date(Date.now() + days * 86400000).toISOString() });
export const adminSaveTheme = (qc: QueryClient, t: { title: string; description: string; startsOn: string; endsOn: string; id?: number | null }) =>
  adminRpc(qc, "admin_save_theme", { p_title: t.title, p_starts_on: t.startsOn, p_ends_on: t.endsOn, p_description: t.description || null, p_id: t.id ?? null });

export type ReportRow = { id: number; target_type: string; target_id: string; reporter_id: string; reason: string | null; created_at: string; resolved_at: string | null };

/** 신고함 — 안 본 것이 위로. 관리자만 읽힙니다(RLS). */
export const useReports = (enabled: boolean) =>
  useQuery({
    queryKey: ["community", "admin", "reports"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("*")
        .order("resolved_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(100);
      return soft("reports 조회", error, (data ?? []) as ReportRow[]);
    },
  });

/* ───────────── 앱 전체 공지 ───────────── */

export type AppNotice = { id: number; title: string; body: string | null; starts_at: string; ends_at: string | null };

/** 기간 안의 가장 최근 공지 하나 — 상단 배너. TODO(푸시): 공지 알림 발송은 이번 범위 밖입니다. */
export const useAppNotice = (enabled: boolean) =>
  useQuery({
    queryKey: ["app-notice"],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("app_notices").select("id, title, body, starts_at, ends_at")
        .lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false }).limit(1);
      if (error) return null;
      return ((data ?? [])[0] as AppNotice | undefined) ?? null;
    },
  });

/* ───────────── 갤러리(HANDOFF-gallery) ───────────── */

/** gallery_feed 한 줄 — 사진 한 장 + 올린 사람 + 가게. 기록의 메모 · 다른 사진은 오지 않습니다. */
export type GalleryPhoto = {
  id: number; author_id: string; nickname: string | null; avatar_url: string | null; character_id: string | null; title_label_id: string | null;
  author_role: "user" | "admin";
  record_id: number; photo_ref: string; menu: string | null; caption: string | null; area: string | null; created_at: string; hidden_at: string | null;
  place_name: string; kind: Kind; category: string | null; address: string | null; verified: boolean; verified_at: string | null;
  lat: number | null; lng: number | null; place: string; by_friend: boolean;
  like_count: number; comment_count: number; my_like: boolean;
};

export type GallerySort = "latest" | "popular" | "friends";
/** 격자를 좁히는 값 — 가게(place) · 동네(area, 앞부분 일치) · 메뉴(포함) · 사람. */
export type GalleryFilter = { sort: GallerySort; gu?: string | null; place?: string | null; area?: string | null; menu?: string | null; authorId?: string | null };

const weekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();

export const useGalleryFeed = (f: GalleryFilter) =>
  useQuery({
    queryKey: ["community", "gallery", "feed", f],
    queryFn: async () => {
      let q = supabase.from("gallery_feed").select("*").is("hidden_at", null);
      if (f.sort === "popular") q = q.gte("created_at", weekAgo()).order("like_count", { ascending: false });
      if (f.sort === "friends") q = q.eq("by_friend", true);
      q = q.order("created_at", { ascending: false }).limit(150);
      if (f.gu) q = q.like("area", `${f.gu}%`);
      if (f.area) q = q.like("area", `${f.area}%`);
      if (f.place) q = q.eq("place", f.place);
      if (f.menu) q = q.ilike("menu", `%${f.menu.replace(/[%_]/g, "")}%`);
      if (f.authorId) q = q.eq("author_id", f.authorId);
      const { data, error } = await q;
      return soft("gallery_feed 조회", error, (data ?? []) as GalleryPhoto[]);
    },
  });

export const useGalleryPhoto = (id: number) =>
  useQuery({
    queryKey: ["community", "gallery", "photo", id],
    queryFn: async () => {
      const { data } = await supabase.from("gallery_feed").select("*").eq("id", id).maybeSingle();
      return (data as GalleryPhoto | null) ?? null;
    },
  });

/** 오늘(한국 날짜) 올라온 사진 수 — 갤러리 제목 옆. */
export const useGalleryToday = () =>
  useQuery({
    queryKey: ["community", "gallery", "today"],
    queryFn: async () => {
      const since = new Date(`${seoulToday()}T00:00:00+09:00`).toISOString();
      const { count } = await supabase.from("gallery_feed").select("id", { count: "exact", head: true }).is("hidden_at", null).gte("created_at", since);
      return count ?? 0;
    },
  });

/** 내가 이미 올린 사진(record_id · photo_ref) — 올리기 화면에서 흐리게 「올림」. 오늘 올린 수도 함께. */
export const useMyGalleryRefs = () =>
  useQuery({
    queryKey: ["community", "gallery", "mine"],
    queryFn: async () => {
      const me = await myId();
      if (!me) return { refs: new Set<string>(), today: 0 };
      const { data } = await supabase.from("gallery_photos").select("record_id, photo_ref, created_at").eq("author_id", me);
      const rows = (data ?? []) as { record_id: number; photo_ref: string; created_at: string }[];
      const since = Date.parse(`${seoulToday()}T00:00:00+09:00`);
      return { refs: new Set(rows.map((r) => `${r.record_id}|${r.photo_ref}`)), today: rows.filter((r) => Date.parse(r.created_at) >= since).length };
    },
  });

export async function postGalleryPhoto(qc: QueryClient, p: { recordId: number; photoRef: string; menu: string | null; caption: string; addMenuToRecord: boolean; area: string | null }) {
  const { data, error } = await supabase.rpc("post_gallery_photo", {
    p_record_id: p.recordId, p_photo_ref: p.photoRef, p_menu: p.menu?.trim() || null, p_caption: stripContact(p.caption).trim() || null,
    p_add_menu_to_record: p.addMenuToRecord, p_area: p.area,
  });
  if (error) throw new Error(error.message.includes("daily_limit") ? "사진은 하루 10장까지 올릴 수 있습니다" : boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "gallery"] });
  if (p.addMenuToRecord) await refreshAll(qc);
  return Number(data);
}

/** 갤러리에서 내리기 — 기록 · 사진 파일은 그대로, 다시 기록 공개 범위대로만 보입니다. */
export async function removeGalleryPhoto(qc: QueryClient, id: number) {
  const { error } = await supabase.from("gallery_photos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "gallery"] });
}

export async function setGalleryLike(qc: QueryClient, photoId: number, on: boolean) {
  const me = await myId();
  if (!me) return;
  const { error } = on
    ? await supabase.from("gallery_likes").insert({ photo_id: photoId, user_id: me })
    : await supabase.from("gallery_likes").delete().eq("photo_id", photoId).eq("user_id", me);
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "gallery"] });
}

export type GalleryComment = {
  id: number; photo_id: number; parent_id: number | null; author_id: string; created_at: string; hidden_at: string | null;
  body: string | null; nickname: string | null; avatar_url: string | null; character_id: string | null; title_label_id: string | null; author_role: "user" | "admin";
};

export const useGalleryComments = (photoId: number) =>
  useQuery({
    queryKey: ["community", "gallery", "comments", photoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gallery_comment_rows").select("*").eq("photo_id", photoId).order("created_at");
      const rows = soft("gallery_comment_rows 조회", error, (data ?? []) as GalleryComment[]);
      return rows.filter((c) => c.parent_id == null).map((c) => ({ ...c, replies: rows.filter((r) => r.parent_id === c.id) }));
    },
  });

export async function addGalleryComment(qc: QueryClient, p: { photoId: number; body: string; parentId?: number | null }) {
  const { error } = await supabase.rpc("add_gallery_comment", {
    p_photo_id: p.photoId, p_body: stripContact(p.body).trim().slice(0, 500), p_parent_id: p.parentId ?? null,
  });
  if (error) throw new Error(boardError(error.message));
  await qc.invalidateQueries({ queryKey: ["community", "gallery"] });
}

export async function deleteGalleryComment(qc: QueryClient, id: number) {
  const { error } = await supabase.from("gallery_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ["community", "gallery"] });
}

export const adminHideGalleryPhoto = (qc: QueryClient, id: number, hide: boolean) => adminRpc(qc, "admin_hide_gallery_photo", { p_id: id, p_hide: hide });
export const adminHideGalleryComment = (qc: QueryClient, id: number, hide: boolean) => adminRpc(qc, "admin_hide_gallery_comment", { p_id: id, p_hide: hide });

export type GalleryScope = "all" | "menu" | "place" | "area" | "person";
export type GalleryPlaceHit = { place: string; name: string; address: string | null; category: string | null; area: string | null; photo_count: number; cover_ref: string | null };
export type GalleryAreaHit = { area: string; photo_count: number; cover_ref: string | null };
export type GalleryPersonHit = { id: string; nickname: string; avatar_url: string | null; character_id: string | null; title_label_id: string | null; role: "user" | "admin"; photo_count: number };
export type GallerySearch = { menu: GalleryPhoto[]; places: GalleryPlaceHit[]; areas: GalleryAreaHit[]; people: GalleryPersonHit[] };

const EMPTY_SEARCH: GallerySearch = { menu: [], places: [], areas: [], people: [] };

export const useGallerySearch = (q: string, scope: GalleryScope) =>
  useQuery({
    queryKey: ["community", "gallery", "search", q, scope],
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gallery_search", { p_q: q, p_scope: scope });
      return soft("gallery_search", error, (data as GallerySearch | null) ?? EMPTY_SEARCH);
    },
  });

/** 요즘 많이 찾는 메뉴 — 최근 7일 갤러리 메뉴 상위 4개. */
export const useGalleryTopMenus = () =>
  useQuery({
    queryKey: ["community", "gallery", "top-menus"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gallery_top_menus");
      return soft("gallery_top_menus", error, ((data ?? []) as { menu: string }[]).map((m) => m.menu));
    },
  });

/* ───────────── 신고 · 차단 ───────────── */

export type ReportTarget = "post" | "answer" | "comment" | "board_comment" | "gallery_photo" | "gallery_comment" | "user" | "tour";

export async function report(targetType: ReportTarget, targetId: string | number, reason: string) {
  const me = await myId();
  const { error } = await supabase.from("reports").insert({ target_type: targetType, target_id: String(targetId), reporter_id: me, reason });
  if (error) throw new Error(error.message);
}

/** 숨기기 · 차단 — 그 사람의 기록 · 글 · 댓글이 내 화면에서 빠집니다. */
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


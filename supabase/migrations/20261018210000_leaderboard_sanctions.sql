-- 랭킹 정지 · 제외 — 부정한 기록으로 랭킹을 채운 것 같은 사람을 관리자가 랭킹에서 뺍니다.
-- 게시판 정지(user_sanctions)와 따로입니다: 기록장 · 게시판 · 친구 소식은 그대로, 랭킹(leaderboard)에만 안 나옵니다.
-- until 이 있으면 그때까지 일시정지, null 이면 영구 제외. 풀면(admin_rank_unban) 바로 다시 나옵니다.

create table if not exists public.leaderboard_sanctions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  until      timestamptz,          -- null = 영구 제외
  reason     text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.leaderboard_sanctions enable row level security;
drop policy if exists "rank sanctions admin read" on public.leaderboard_sanctions;
create policy "rank sanctions admin read" on public.leaderboard_sanctions for select to authenticated using (public.is_admin());

create or replace function public.is_rank_banned(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leaderboard_sanctions where user_id = p_user and (until is null or until > now()));
$$;

create or replace function public.admin_rank_ban(p_user uuid, p_until timestamptz, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  insert into public.leaderboard_sanctions (user_id, until, reason, created_by) values (p_user, p_until, p_reason, auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_by = excluded.created_by, created_at = now();
  perform public.admin_log('rank_ban', 'user', p_user::text, coalesce(p_until::text, 'forever') || coalesce(' · ' || p_reason, ''));
end $$;

create or replace function public.admin_rank_unban(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  delete from public.leaderboard_sanctions where user_id = p_user;
  perform public.admin_log('rank_unban', 'user', p_user::text);
end $$;

-- 랭킹 — 20261016000100 의 정의 그대로 + 랭킹 정지 · 제외된 사람 빼기.
create or replace function public.leaderboard(p_board text, p_period text, p_scope text, p_category text default null)
returns table (user_id uuid, nickname text, avatar_url text, character_id text, title_label_id text, value int, rank int)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select (case p_period
              when 'week' then date_trunc('week', now() at time zone 'Asia/Seoul')
              when 'quarter' then date_trunc('quarter', now() at time zone 'Asia/Seoul')
              else date_trunc('month', now() at time zone 'Asia/Seoul')
            end)::date as since,
           date_trunc('week', now() at time zone 'Asia/Seoul')::date as this_week
  ),
  people as (
    select p.id, p.nickname, p.avatar_url, p.character_id, p.title_label_id
    from public.profiles p
    where p.leaderboard_opt_in and p.nickname is not null
      and (p_scope = 'all' or p.id = auth.uid() or public.is_friend(auth.uid(), p.id))
      and not public.is_rank_banned(p.id)
  ),
  visits as (
    select distinct on (r.user_id, place, day)
      r.user_id,
      public.place_of(r.place_key, r.name, r.address) as place,
      (r.verified_at at time zone 'Asia/Seoul')::date as day,
      r.category,
      substring(coalesce(r.address, '') from '([가-힣]+[구군])(\s|$)') as gu
    from public.restaurants r
    join people pe on pe.id = r.user_id
    where r.verified and r.verified_at is not null and coalesce(r.pending, false) = false
      and r.source_record_id is null and r.copied_at is null
  ),
  in_period as (select v.* from visits v, bounds b where v.day >= b.since),
  firsts as (
    select v.user_id, v.place, min(v.day) as first_day from visits v group by v.user_id, v.place
  ),
  per_place as (
    select v.user_id, v.place, count(*) as n from in_period v group by v.user_id, v.place
  ),
  -- 꾸준함: 이번 주(또는 지난주)에서 끝나는 연속 주 수
  wk as (select distinct v.user_id, date_trunc('week', v.day)::date as w from visits v),
  isl as (select wk.user_id, wk.w, wk.w - (row_number() over (partition by wk.user_id order by wk.w) * 7)::int as grp from wk),
  runs as (select isl.user_id, max(isl.w) as last_w, count(*) as len from isl group by isl.user_id, isl.grp),
  scores as (
    select pe.id as uid,
      (case p_board
        when 'verified' then (select count(*) from in_period v where v.user_id = pe.id)
        when 'category' then (select count(*) from in_period v where v.user_id = pe.id and v.category = p_category)
        when 'explorer' then (select count(*) from firsts f, bounds b where f.user_id = pe.id and f.first_day >= b.since)
        when 'regular'  then (select coalesce(max(pp.n) - 1, 0) from per_place pp where pp.user_id = pe.id)
        when 'district' then (select count(distinct v.gu) from in_period v where v.user_id = pe.id)
        when 'streak'   then (select coalesce(max(ru.len), 0) from runs ru, bounds b where ru.user_id = pe.id and ru.last_w >= b.this_week - 7)
        else 0
      end)::int as value
    from people pe
  )
  select pe.id, pe.nickname, pe.avatar_url, pe.character_id, pe.title_label_id, s.value,
         (rank() over (order by s.value desc))::int
  from scores s join people pe on pe.id = s.uid
  where s.value > 0
  order by 7, pe.nickname;
$$;
revoke execute on function public.leaderboard(text, text, text, text) from public, anon;
grant execute on function public.leaderboard(text, text, text, text) to authenticated;

-- 프로필 창 — 관리자에게 랭킹 정지 상태도(rank_banned_until).
create or replace function public.public_profile_card(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or public.is_blocked(p_user) then null else (
    select json_build_object(
      'id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url, 'character_id', p.character_id,
      'title_label_id', p.title_label_id, 'role', p.role,
      'record_count', (select count(*) from public.restaurants r
                        where r.user_id = p.id and coalesce(r.pending, false) = false and r.source_record_id is null and r.copied_at is null),
      'verified_count', (select count(*) from public.restaurants r
                        where r.user_id = p.id and r.verified and coalesce(r.pending, false) = false and r.source_record_id is null and r.copied_at is null),
      'post_count', (select count(*) from public.board_posts bp where bp.author_id = p.id and bp.hidden_at is null),
      'friend_state', case
        when p.id = auth.uid() then 'self'
        when public.is_friend(auth.uid(), p.id) then 'friend'
        when exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id) then 'sent'
        when exists (select 1 from public.friendships f where f.user_id = p.id and f.friend_id = auth.uid()) then 'received'
        else 'none' end,
      'sanctioned_until', case when public.is_admin() then (
        select coalesce(s.until::text, 'forever') from public.user_sanctions s where s.user_id = p.id and (s.until is null or s.until > now())) end,
      'rank_banned_until', case when public.is_admin() then (
        select coalesce(s.until::text, 'forever') from public.leaderboard_sanctions s where s.user_id = p.id and (s.until is null or s.until > now())) end
    )
    from public.profiles p where p.id = p_user and p.nickname is not null
  ) end;
$$;

revoke execute on function public.is_rank_banned(uuid) from public, anon;
revoke execute on function public.admin_rank_ban(uuid, timestamptz, text) from public, anon;
revoke execute on function public.admin_rank_unban(uuid) from public, anon;
grant execute on function public.is_rank_banned(uuid) to authenticated;
grant execute on function public.admin_rank_ban(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_rank_unban(uuid) to authenticated;

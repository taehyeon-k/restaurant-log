-- 「내 기록에도 남기기」 복사본은 같은 방문이라 커뮤니티 집계에서 뺍니다(원본만 셉니다).
-- 20261015000100 의 정의를 그대로 두고 복사본 조건만 더했습니다.
-- available_tickets 는 개인 기록장만 세므로 그대로 둡니다.

-- p_board: verified · explorer · regular · district · streak · category(p_category)
-- p_period: week · month · quarter (한국 시간) / p_scope: friends(나 + 친구) · all
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

-- 인증 기록 수(보관함 제외)
create or replace function public.my_verified_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.restaurants
  where user_id = auth.uid() and verified is true and coalesce(pending, false) = false
    and source_record_id is null and copied_at is null;
$$;

-- 그 글의 가게에 내 인증 기록이 있는지 — 「가봤어요」는 이때만.
create or replace function public.has_been(p_post_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.board_posts p
    join public.restaurants pr on pr.id = p.record_id
    join public.restaurants mine on mine.user_id = auth.uid() and mine.verified and coalesce(mine.pending, false) = false
      and mine.source_record_id is null and mine.copied_at is null
    where p.id = p_post_id
      and (public.place_of(mine.place_key, mine.name, mine.address) = public.place_of(pr.place_key, pr.name, pr.address)
           or lower(replace(mine.name, ' ', '')) = lower(replace(pr.name, ' ', '')))
  );
$$;

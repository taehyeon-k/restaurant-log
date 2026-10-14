-- 연인 기록 「내 기록에도 남기기」: 내가 찍은 연인 기록을 개인 기록장에 복사본으로 한 번 남깁니다.
-- 옮기는 것: 기록 행 전체(사진 · 메뉴 · 내 별점 · 메모 · 가게 정보 · verified · verified_at)
-- 옮기지 않는 것: 상대의 record_notes, anniversary_picks, pending, visibility
-- 같은 원본은 한 기록장에 한 번만. 복사 뒤에는 서로 독립입니다.

alter table public.restaurants
  add column if not exists source_record_id bigint references public.restaurants(id) on delete set null,
  add column if not exists copied_at timestamptz;

create unique index if not exists restaurants_source_once_idx
  on public.restaurants (book_id, source_record_id) where source_record_id is not null;

-- 20260907000000 의 트리거에 복사 분기만 더합니다. 복사본은 원본의 인증 시각을 그대로 가져갑니다
-- (원래대로면 insert 때 now() 로 덮어써집니다). source_record_id · copied_at 은 나중에 고칠 수 없습니다.
create or replace function public.set_restaurants_verified_at()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' then
    new.source_record_id := old.source_record_id;
    new.copied_at := old.copied_at;
  end if;

  if tg_op = 'INSERT' and new.source_record_id is not null then
    select user_id, verified, verified_at into s from public.restaurants where id = new.source_record_id;
    if s.user_id is null or s.user_id <> new.user_id then raise exception 'not_my_record'; end if;
    new.verified := s.verified;
    new.verified_at := s.verified_at;
    new.copied_at := now();
    return new;
  end if;

  if new.verified is true then
    if tg_op = 'UPDATE' and old.verified is true and old.verified_at is not null then
      new.verified_at := old.verified_at;
    else
      new.verified_at := now();
    end if;
  else
    new.verified_at := null;
  end if;
  return new;
end $$;

create or replace function public.copy_record_to_personal(p_record bigint) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  src public.restaurants;
  pbook uuid;
  cols text;
  new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into src from public.restaurants where id = p_record;
  if src.id is null or not public.is_book_member(src.book_id) then raise exception 'not_found'; end if;
  if src.user_id <> uid then raise exception 'not_my_record'; end if;
  if coalesce(src.pending, false) then raise exception 'pending_record'; end if;
  if not exists (select 1 from public.books where id = src.book_id and kind = 'couple') then raise exception 'not_couple_record'; end if;

  pbook := public.personal_book_id(uid);

  select id into new_id from public.restaurants where book_id = pbook and source_record_id = p_record;
  if new_id is not null then return new_id; end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'restaurants'
    and is_generated = 'NEVER'
    and column_name not in ('id', 'book_id', 'source_record_id', 'copied_at', 'created_at', 'updated_at', 'verified_at', 'pending', 'visibility');

  execute format(
    'insert into public.restaurants (%1$s, book_id, source_record_id) select %1$s, $1, $2 from public.restaurants where id = $2 returning id',
    cols
  ) into new_id using pbook, p_record;

  return new_id;
end $$;

revoke execute on function public.copy_record_to_personal(bigint) from public, anon;
grant execute on function public.copy_record_to_personal(bigint) to authenticated;

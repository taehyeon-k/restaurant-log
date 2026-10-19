-- 링크로 여러 곳 담기(HANDOFF-wish-group §2) — 게시물 하나에 나온 가게 여러 곳을 그룹 이름으로 묶습니다.
-- 그룹도 위시처럼 기록장(book_id)에 속하고, 정책은 wishes 와 같습니다(20261015000000).
-- 위시에는 원 게시물의 제목 · 작성자(유튜브 · 블로그)도 같이 남깁니다. 블로그 메타는 link-meta 함수가 하루 캐시합니다.

create table if not exists public.wish_groups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id       uuid references public.books(id) on delete cascade,
  name          varchar(20) not null check (length(trim(name)) > 0),
  source_url    text,
  source_kind   text,
  source_title  text,
  source_author text,
  created_at    timestamptz not null default now()
);
create index if not exists wish_groups_book_idx on public.wish_groups (book_id);

drop trigger if exists trg_wish_groups_book_id on public.wish_groups;
create trigger trg_wish_groups_book_id before insert on public.wish_groups
  for each row execute function public.fill_book_id();
alter table public.wish_groups alter column book_id set not null;

alter table public.wish_groups enable row level security;
drop policy if exists "wish_groups read" on public.wish_groups;
drop policy if exists "wish_groups insert" on public.wish_groups;
drop policy if exists "wish_groups update" on public.wish_groups;
drop policy if exists "wish_groups delete" on public.wish_groups;
create policy "wish_groups read" on public.wish_groups for select to authenticated using (public.is_book_member(book_id));
create policy "wish_groups insert" on public.wish_groups for insert to authenticated
  with check (auth.uid() = user_id and public.book_writable(book_id));
create policy "wish_groups update" on public.wish_groups for update to authenticated
  using (public.book_writable(book_id)) with check (public.book_writable(book_id));
create policy "wish_groups delete" on public.wish_groups for delete to authenticated using (public.book_writable(book_id));

alter table public.wishes add column if not exists group_id uuid references public.wish_groups(id) on delete set null;
alter table public.wishes add column if not exists group_pos int;
alter table public.wishes add column if not exists source_title text;
alter table public.wishes add column if not exists source_author text;
create index if not exists wishes_group_idx on public.wishes (group_id, group_pos);

alter table public.wishes drop constraint if exists wishes_source_kind_check;
alter table public.wishes add constraint wishes_source_kind_check
  check (source_kind is null or source_kind in ('shorts','youtube','reels','instagram','tiktok','blog','link'));

-- 그룹에 남은 위시가 없으면 그룹도 지웁니다(기록이 되어 지워지거나 그룹에서 빠질 때).
create or replace function public.drop_empty_wish_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.group_id is not null and not exists (select 1 from public.wishes where group_id = old.group_id) then
    delete from public.wish_groups where id = old.group_id;
  end if;
  return null;
end $$;
drop trigger if exists wishes_drop_empty_group on public.wishes;
create trigger wishes_drop_empty_group after delete or update of group_id on public.wishes
  for each row execute function public.drop_empty_wish_group();

-- link-meta 캐시 — 함수(service role)만 읽고 씁니다.
create table if not exists public.link_meta_cache (
  url        text primary key,
  title      text,
  author     text,
  final_url  text,
  fetched_at timestamptz not null default now()
);
alter table public.link_meta_cache enable row level security;

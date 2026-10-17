-- 우리 도장(지시서 3 §F) 「콕 찌르기」 — 한 줄을 나만 쓴 기록에서 상대에게 「한 줄 써 줘」를 보냅니다.
-- 기록 하나 · 보낸 사람 하나에 한 줄(다시 찌르면 시각만 새로, 안 본 상태로). 받은 사람 앱이 열릴 때 알림으로 띄우고 seen_at 을 채웁니다.
create table if not exists public.pokes (
  record_id   bigint not null references public.restaurants(id) on delete cascade,
  from_user   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  book_id     uuid not null references public.books(id) on delete cascade,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz,
  primary key (record_id, from_user)
);
create index if not exists pokes_to_idx on public.pokes (to_user) where seen_at is null;

alter table public.pokes enable row level security;

drop policy if exists "pokes read" on public.pokes;
create policy "pokes read" on public.pokes for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- 보내기: 쓸 수 있는 연인 기록장의 기록에, 같은 기록장 사람에게만.
drop policy if exists "pokes send" on public.pokes;
create policy "pokes send" on public.pokes for insert to authenticated
  with check (
    from_user = auth.uid() and to_user <> auth.uid()
    and public.book_writable(book_id)
    and exists (select 1 from public.restaurants r where r.id = record_id and r.book_id = pokes.book_id)
    and exists (select 1 from public.book_members m where m.book_id = pokes.book_id and m.user_id = to_user)
  );

-- 다시 찌르기(보낸 사람) · 봤음 표시(받은 사람).
drop policy if exists "pokes update" on public.pokes;
create policy "pokes update" on public.pokes for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid())
  with check (from_user = auth.uid() or to_user = auth.uid());

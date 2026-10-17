-- 도장판(지시서 3 §E-1): 인증 기록 1건 = 도장 1개, 10칸을 채울 때마다 뽑기권 1장.
-- 예전엔 인증 5건마다 1장이었습니다. 나머지(첫 1장 · 라벨 · 중복 전환 보너스 − 뽑은 수)는 그대로.
create or replace function public.available_tickets(p_label_count int) returns int
language sql stable security definer set search_path = public as $$
  select
    1
    + (select count(*)::int / 10 from public.restaurants r
        join public.books b on b.id = r.book_id and b.kind = 'personal'
        where r.user_id = auth.uid() and r.verified is true and coalesce(r.pending, false) = false)
    + greatest(coalesce(p_label_count, 0), 0)
    + coalesce((select ticket_bonus from public.profiles where id = auth.uid()), 0)
    - (select count(*)::int from public.character_draws where user_id = auth.uid());
$$;

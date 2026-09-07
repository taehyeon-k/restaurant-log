-- GPS-verified visits get an exact, tamper-resistant timestamp.
--
-- verified_at is always stamped from the database clock (now()), never from
-- whatever the client sends, and only while `verified` is true:
--   - insert, or a false -> true transition on `verified`: stamped to now()
--   - verified stays true across a later edit: original stamp is kept,
--     ignoring any verified_at value the client tries to send
--   - `verified` is false/null: verified_at is forced back to null
--
-- This lets writes keep coming straight from the browser (anon key) while
-- still making the timestamp trustworthy, since only the trigger can set it.

alter table public.restaurants
  add column if not exists verified_at timestamptz;

create or replace function public.set_restaurants_verified_at()
returns trigger
language plpgsql
as $$
begin
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
end;
$$;

drop trigger if exists trg_restaurants_verified_at on public.restaurants;

create trigger trg_restaurants_verified_at
before insert or update on public.restaurants
for each row
execute function public.set_restaurants_verified_at();

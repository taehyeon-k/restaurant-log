-- Apply and verify BEFORE publishing the client OTA. Older/web clients omit this nullable field.
alter table public.restaurants add column if not exists client_op_id uuid;
create unique index if not exists restaurants_client_op_id_owner_idx
  on public.restaurants (user_id, client_op_id) where client_op_id is not null;
comment on column public.restaurants.client_op_id is
  'Client capture operation UUID; idempotent per owner. Null for legacy/web records and personal copies.';

-- copy_record_to_personal copies columns dynamically. Its copy must not claim the
-- source capture operation, or the new uniqueness constraint would break copying.
-- This invoker trigger changes no privileges or existing verification rules.
create or replace function public.preserve_restaurant_operation_id()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.client_op_id := old.client_op_id;
  elsif new.source_record_id is not null then
    new.client_op_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_restaurant_operation_id() from public, anon, authenticated;
drop trigger if exists preserve_restaurant_operation_id on public.restaurants;
create trigger preserve_restaurant_operation_id before insert or update on public.restaurants
  for each row execute function public.preserve_restaurant_operation_id();

-- Append-only INSERT retry support; no UPDATE grants or RLS changes needed.
alter table public.rec_events add column if not exists client_event_id uuid;
create unique index if not exists rec_events_client_event_id_owner_idx
  on public.rec_events (user_id, client_event_id) where client_event_id is not null;
comment on column public.rec_events.client_event_id is
  'Stable client event UUID for deduplication per owner; null for older clients.';

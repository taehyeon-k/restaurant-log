-- restaurant-log · migration 004
-- Creates the photo bucket and permits uploads from the current public client.
-- Authentication is intentionally not addressed yet.

-- Create the bucket if it does not already exist, and make public URLs readable.
insert into storage.buckets (id, name, public)
values ('restaurant-photos', 'restaurant-photos', true)
on conflict (id) do update
set public = true;

-- The current app uploads directly from the browser using the Supabase public key.
-- Allow INSERT only into this bucket. This is intentionally permissive until auth
-- is added later.
drop policy if exists "restaurant photos public upload" on storage.objects;

create policy "restaurant photos public upload"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'restaurant-photos');

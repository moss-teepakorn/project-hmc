-- Compatibility policy for deployments that use custom app auth (anon role).
-- The app uploads vehicle request images from resident pages without Supabase Auth JWT,
-- so storage writes may run as role "anon" and fail against authenticated-only policies.

-- Keep existing bucket config
insert into storage.buckets (id, name, public, file_size_limit)
values ('vehicle-images', 'vehicle-images', true, 102400)
on conflict (id) do nothing;

update storage.buckets
set public = true,
    file_size_limit = 102400,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vehicle-images';

-- Add open policy (idempotent) so uploads from resident flow do not hit RLS errors.
drop policy if exists "allow_all_vehicle_images" on storage.objects;

create policy "allow_all_vehicle_images"
  on storage.objects
  for all
  using (bucket_id = 'vehicle-images')
  with check (bucket_id = 'vehicle-images');

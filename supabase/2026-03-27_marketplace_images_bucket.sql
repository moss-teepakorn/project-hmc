-- Create marketplace-images storage bucket (public, 100KB limit per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketplace-images', 'marketplace-images', true, 102400)
on conflict (id) do nothing;

-- Allow all operations on marketplace-images bucket
create policy "allow_all_marketplace_images"
  on storage.objects
  for all
  using (bucket_id = 'marketplace-images')
  with check (bucket_id = 'marketplace-images');

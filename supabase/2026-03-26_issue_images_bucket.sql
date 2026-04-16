-- Create issue-images storage bucket (public, 100KB limit per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('issue-images', 'issue-images', true, 102400)
on conflict (id) do nothing;

-- Allow all operations (RLS is disabled for this application)
create policy "allow_all_issue_images"
  on storage.objects
  for all
  using (bucket_id = 'issue-images')
  with check (bucket_id = 'issue-images');

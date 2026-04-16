-- Create work-report-images storage bucket (public, 102400 bytes = 100KB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-report-images', 'work-report-images', true, 102400)
on conflict (id) do nothing;

-- Allow all operations on work-report-images bucket
create policy "allow_all_work_report_images"
  on storage.objects
  for all
  using (bucket_id = 'work-report-images')
  with check (bucket_id = 'work-report-images');

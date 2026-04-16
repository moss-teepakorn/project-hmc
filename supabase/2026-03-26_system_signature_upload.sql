-- Add juristic signature fields into system_config
alter table system_config
  add column if not exists juristic_signature_url text,
  add column if not exists juristic_signature_path text;

-- Create system-assets storage bucket for config resources (logo/signature)
insert into storage.buckets (id, name, public, file_size_limit)
values ('system-assets', 'system-assets', true, 512000)
on conflict (id) do nothing;

create policy "allow_all_system_assets"
  on storage.objects
  for all
  using (bucket_id = 'system-assets')
  with check (bucket_id = 'system-assets');

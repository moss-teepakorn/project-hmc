-- Add support for multiple marketplace images (max 2 handled in app)
alter table if exists marketplace
  add column if not exists image_urls text[] default '{}';

alter table if exists marketplace
  add column if not exists image_paths text[] default '{}';

-- Backfill from legacy image_url when available
update marketplace
set image_urls = case
  when coalesce(image_url, '') <> '' and (image_urls is null or cardinality(image_urls) = 0)
    then array[image_url]
  else coalesce(image_urls, '{}')
end
where coalesce(image_url, '') <> '';

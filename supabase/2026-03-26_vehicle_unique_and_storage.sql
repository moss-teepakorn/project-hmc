-- ============================================================
-- Vehicle hardening patch
-- - Enforce DB-level uniqueness for (license_plate + brand)
-- - Ensure Supabase Storage bucket: vehicle-images
-- - Add storage policies required by app image upload flow
-- ============================================================

-- 1) Check duplicates before creating unique index
--    If this query returns rows, fix duplicates first.
--    Normalization rule used by index:
--      - license_plate: trim + remove all whitespace + lower-case
--      - brand: trim + lower-case (NULL treated as '')
select
  lower(regexp_replace(trim(license_plate), '\\s+', '', 'g')) as normalized_license_plate,
  lower(trim(coalesce(brand, ''))) as normalized_brand,
  count(*) as duplicate_count,
  array_agg(id) as vehicle_ids
from vehicles
group by 1, 2
having count(*) > 1;

-- 2) Create DB-level unique index (100% enforce at database layer)
--    This blocks case/space variants from being inserted as duplicates.
create unique index if not exists uq_vehicles_license_plate_brand_normalized
on vehicles (
  lower(regexp_replace(trim(license_plate), '\\s+', '', 'g')),
  lower(trim(coalesce(brand, '')))
);

-- 3) Ensure storage bucket exists
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vehicle-images',
  'vehicle-images',
  true,
  102400,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 102400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vehicle-images';

-- 4) Storage policies
-- Read (public) - allow viewing thumbnails/full images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read vehicle images'
  ) THEN
    CREATE POLICY "Public read vehicle images"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'vehicle-images');
  END IF;
END
$$;

-- Upload (authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated upload vehicle images'
  ) THEN
    CREATE POLICY "Authenticated upload vehicle images"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'vehicle-images');
  END IF;
END
$$;

-- Update (authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated update vehicle images'
  ) THEN
    CREATE POLICY "Authenticated update vehicle images"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'vehicle-images')
      WITH CHECK (bucket_id = 'vehicle-images');
  END IF;
END
$$;

-- Delete (authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated delete vehicle images'
  ) THEN
    CREATE POLICY "Authenticated delete vehicle images"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'vehicle-images');
  END IF;
END
$$;

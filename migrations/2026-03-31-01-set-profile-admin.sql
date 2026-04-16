-- Migration: Set existing profile as admin and ensure username
-- Date: 2026-03-31

BEGIN;

-- Update the specific profile shown by the user to have a username (if missing)
-- and grant admin privileges so RLS policies allow admin operations.
UPDATE public.profiles
SET username = COALESCE(username, 'saduii'),
    is_admin = true,
    updated_at = now()
WHERE id = '81bb0820-e4fc-4274-b236-b783435382d3';

COMMIT;

-- Notes:
-- - This migration makes the profile with id '81bb0820-e4fc-4274-b236-b783435382d3' an admin.
-- - If you'd rather grant admin to a different id or use an email-based update, modify the WHERE clause accordingly.

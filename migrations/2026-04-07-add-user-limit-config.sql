-- User activation limits
ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS max_active_users_per_house integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_active_users_total integer NOT NULL DEFAULT 1000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_config_max_active_users_per_house_check'
  ) THEN
    ALTER TABLE public.system_config
      ADD CONSTRAINT system_config_max_active_users_per_house_check CHECK (max_active_users_per_house > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_config_max_active_users_total_check'
  ) THEN
    ALTER TABLE public.system_config
      ADD CONSTRAINT system_config_max_active_users_total_check CHECK (max_active_users_total > 0);
  END IF;
END $$;

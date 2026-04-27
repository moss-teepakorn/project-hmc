-- Migration: add ext column to members for phone extension
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS ext text not null default '';

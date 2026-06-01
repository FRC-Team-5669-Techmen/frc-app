-- Run this in the Supabase SQL editor to add verification tracking columns.
ALTER TABLE public.logged_hours
  ADD COLUMN IF NOT EXISTS verified_by uuid references public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

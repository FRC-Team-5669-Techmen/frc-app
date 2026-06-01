-- Adds grad_year to profiles if it does not already exist.
-- Run this alongside profile_customization.sql if you haven't already.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS grad_year integer;

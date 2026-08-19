-- ============================================================
-- FLL volunteering interest (commitment step addition)
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- Single-select Yes / No / Maybe, same optionality pattern as
-- transport_after_5pm's neighbors -- nullable, no CHECK constraint, so an
-- unanswered question is storable and distinct from a "No".
--
-- Depends on: public.member_applications (supabase/member_applications.sql).
-- Must run AFTER supabase/parent_responses.sql: that migration dropped the
-- table-level SELECT/INSERT grant on member_applications and re-grants column
-- by column, so a column added afterward has NO client grant until one is
-- added explicitly -- this file adds it for just this column rather than
-- requiring a full re-run of parent_responses.sql.
-- ============================================================

alter table public.member_applications
  add column if not exists fll_volunteering_interest text;

grant select (fll_volunteering_interest), insert (fll_volunteering_interest)
  on public.member_applications to authenticated;

-- ════════════════════════════════════════════════════
-- SKINS VIP — Add gender columns to guest_registrations
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════

ALTER TABLE guest_registrations
  ADD COLUMN IF NOT EXISTS male_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS female_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registered_by TEXT;

-- Also add registered_by to bar_registrations
ALTER TABLE bar_registrations
  ADD COLUMN IF NOT EXISTS registered_by TEXT;

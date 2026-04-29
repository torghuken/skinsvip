-- ════════════════════════════════════════════════════
-- SKINS VIP — Check-ins table
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS check_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ DEFAULT NOW(),
  checked_in_by   TEXT,
  session_date    DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_check_ins_profile ON check_ins (profile_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_session ON check_ins (session_date, checked_in_at DESC);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read check_ins"
  ON check_ins FOR SELECT USING (true);

CREATE POLICY "Service role manages check_ins"
  ON check_ins FOR ALL
  USING (auth.role() = 'service_role');

-- Enable Realtime for live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE check_ins;

-- ════════════════════════════════════════════════════
-- SKINS VIP — Social media integration tables
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════

-- Instagram posts (synced from Meta Graph API)
CREATE TABLE IF NOT EXISTS instagram_posts (
  id TEXT PRIMARY KEY,                -- Instagram media ID
  caption TEXT,
  media_type TEXT,                    -- IMAGE, VIDEO, CAROUSEL_ALBUM
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,                 -- for VIDEO type
  permalink TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read instagram_posts"
  ON instagram_posts FOR SELECT USING (true);

CREATE POLICY "Service role manages instagram_posts"
  ON instagram_posts FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_instagram_posts_timestamp
  ON instagram_posts (timestamp DESC);

-- Facebook events (synced from Graph API)
CREATE TABLE IF NOT EXISTS facebook_events (
  id TEXT PRIMARY KEY,                -- Facebook event ID
  name TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  cover_url TEXT,
  place_name TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE facebook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read facebook_events"
  ON facebook_events FOR SELECT USING (true);

CREATE POLICY "Service role manages facebook_events"
  ON facebook_events FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_facebook_events_start
  ON facebook_events (start_time ASC);

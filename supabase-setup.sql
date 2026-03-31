-- ============================================================
-- SKINS VIP Ambassador Portal – Database Setup v2
-- Kjør dette i Supabase → SQL Editor
-- ============================================================

-- 1. PROFILER
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  email         TEXT,
  role          TEXT DEFAULT 'ambassador'
                CHECK (role IN ('super_admin', 'admin', 'staff', 'ambassador')),
  ambassador_code TEXT UNIQUE,       -- f.eks. SKINS-01
  total_points  INTEGER DEFAULT 0,
  total_guests  INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  credits       NUMERIC DEFAULT 0,  -- opptjente ambassador credits
  rank          INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GJESTEREGISTRERINGER (kjernen i systemet)
CREATE TABLE IF NOT EXISTS guest_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  registered_by   UUID REFERENCES profiles(id),  -- hvilken ansatt
  guest_count     INTEGER NOT NULL,
  event_type      TEXT DEFAULT 'regular'
                  CHECK (event_type IN ('regular','birthday','corporate','table','vip_event')),
  registered_at   TIMESTAMPTZ DEFAULT NOW(),      -- tidsstempel for multiplikator
  base_points     INTEGER DEFAULT 0,
  time_multiplier NUMERIC DEFAULT 1,
  bonus_points    INTEGER DEFAULT 0,
  total_points    INTEGER DEFAULT 0,
  notes           TEXT,
  session_date    DATE DEFAULT CURRENT_DATE
);

-- 3. OMSETNINGSREGISTRERINGER
CREATE TABLE IF NOT EXISTS revenue_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  registered_by   UUID REFERENCES profiles(id),
  amount          NUMERIC NOT NULL,
  points_earned   INTEGER DEFAULT 0,
  credits_earned  NUMERIC DEFAULT 0,
  registered_at   TIMESTAMPTZ DEFAULT NOW(),
  session_date    DATE DEFAULT CURRENT_DATE,
  notes           TEXT
);

-- 4. BOOKINGER
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_name      TEXT NOT NULL,
  event_type      TEXT DEFAULT 'regular'
                  CHECK (event_type IN ('regular','birthday','corporate','table','vip_event')),
  event_date      TIMESTAMPTZ NOT NULL,
  guest_count     INTEGER DEFAULT 0,
  expected_spend  NUMERIC,
  notes           TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  admin_note      TEXT,
  responded_by    UUID REFERENCES profiles(id),
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. UKENTLIGE OG MÅNEDLIGE SCORE-SNAPSHOTS
CREATE TABLE IF NOT EXISTS weekly_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  week_end        DATE NOT NULL,
  points          INTEGER DEFAULT 0,
  guests          INTEGER DEFAULT 0,
  revenue         NUMERIC DEFAULT 0,
  is_winner       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ambassador_id, week_start)
);

CREATE TABLE IF NOT EXISTS monthly_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  points          INTEGER DEFAULT 0,
  guests          INTEGER DEFAULT 0,
  revenue         NUMERIC DEFAULT 0,
  is_winner       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ambassador_id, year, month)
);

-- 6. JUSTERBAR POENGFORMEL (super admin kan endre disse)
CREATE TABLE IF NOT EXISTS point_settings (
  key         TEXT PRIMARY KEY,
  value       NUMERIC NOT NULL,
  label       TEXT,
  description TEXT,
  category    TEXT
);

INSERT INTO point_settings VALUES
  -- Gjester (avtagende verdi)
  ('pts_guest_1_10',     10,  'Poeng per gjest (1–10)',    'De første 10 gjestene', 'guests'),
  ('pts_guest_11_25',     7,  'Poeng per gjest (11–25)',   '', 'guests'),
  ('pts_guest_26_50',     5,  'Poeng per gjest (26–50)',   '', 'guests'),
  ('pts_guest_51_100',    3,  'Poeng per gjest (51–100)',  '', 'guests'),
  ('pts_guest_100plus',   2,  'Poeng per gjest (100+)',    '', 'guests'),
  -- Tidsmultiplikatorer
  ('mult_before_2200',    3,  'Multiplikator før kl. 22:00', 'Tidligste gjester – høyest verdi', 'time'),
  ('mult_2200_2300',      2,  'Multiplikator 22:00–23:00', '', 'time'),
  ('mult_2300_0000',    1.5,  'Multiplikator 23:00–00:00', '', 'time'),
  ('mult_after_0000',     1,  'Multiplikator etter 00:00', '', 'time'),
  -- Arrangementsbonuser (flat, ingen tidsmultiplikator)
  ('bonus_birthday',    300,  'Bonus bursdag',             'Flat bonus for bursdagsfeiring', 'events'),
  ('bonus_corporate',   400,  'Bonus personalfest',        'Flat bonus for bedriftsarrangementer', 'events'),
  ('bonus_table',       150,  'Bonus bordbooking',         'Flat bonus for bordbooking', 'events'),
  ('bonus_vip_event',   500,  'Bonus VIP-arrangement',     'Flat bonus for private VIP-events', 'events'),
  -- Omsetning
  ('pts_revenue_100',     1,  'Poeng per 100 kr omsetning', '', 'revenue'),
  -- Ambassador Credits
  ('credits_per_points', 100, 'Poeng per credit',           '1 credit per X poeng per kveld', 'credits'),
  ('credits_max_night',   3,  'Maks credits per kveld',    '', 'credits')
ON CONFLICT (key) DO NOTHING;

-- 7. AUTO-OPPRETT PROFIL VED REGISTRERING
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  next_code TEXT;
  code_num  INTEGER;
BEGIN
  -- Generer neste ambassadørkode
  SELECT COUNT(*) + 1 INTO code_num FROM profiles;
  next_code := 'SKINS-' || LPAD(code_num::TEXT, 2, '0');

  INSERT INTO profiles (id, full_name, phone, email, role, ambassador_code)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    'ambassador',
    next_code
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 8. BEREGN POENG FOR GJESTEREGISTRERING
CREATE OR REPLACE FUNCTION calculate_guest_points(
  p_guest_count   INTEGER,
  p_event_type    TEXT,
  p_registered_at TIMESTAMPTZ,
  p_settings      JSONB DEFAULT NULL
)
RETURNS TABLE(base_pts INTEGER, multiplier NUMERIC, bonus_pts INTEGER, total_pts INTEGER)
AS $$
DECLARE
  v_hour        INTEGER;
  v_mult        NUMERIC;
  v_base        INTEGER := 0;
  v_bonus       INTEGER := 0;
  v_remaining   INTEGER;
  s             JSONB;
BEGIN
  -- Hent innstillinger
  IF p_settings IS NULL THEN
    SELECT jsonb_object_agg(key, value) INTO s FROM point_settings;
  ELSE
    s := p_settings;
  END IF;

  v_hour := EXTRACT(HOUR FROM p_registered_at AT TIME ZONE 'Europe/Oslo');

  -- Tidsmultiplikator (kun for regular, ikke arrangementer)
  IF p_event_type = 'regular' THEN
    IF v_hour < 22 THEN v_mult := (s->>'mult_before_2200')::NUMERIC;
    ELSIF v_hour < 23 THEN v_mult := (s->>'mult_2200_2300')::NUMERIC;
    ELSIF v_hour < 24 THEN v_mult := (s->>'mult_2300_0000')::NUMERIC;
    ELSE v_mult := (s->>'mult_after_0000')::NUMERIC;
    END IF;
  ELSE
    v_mult := 1; -- Arrangementer får ingen tidsmultiplikator
  END IF;

  -- Beregn basispoeng (avtagende)
  v_remaining := p_guest_count;
  IF v_remaining > 0 THEN
    v_base := v_base + LEAST(v_remaining, 10) * (s->>'pts_guest_1_10')::INTEGER;
    v_remaining := GREATEST(0, v_remaining - 10);
  END IF;
  IF v_remaining > 0 THEN
    v_base := v_base + LEAST(v_remaining, 15) * (s->>'pts_guest_11_25')::INTEGER;
    v_remaining := GREATEST(0, v_remaining - 15);
  END IF;
  IF v_remaining > 0 THEN
    v_base := v_base + LEAST(v_remaining, 25) * (s->>'pts_guest_26_50')::INTEGER;
    v_remaining := GREATEST(0, v_remaining - 25);
  END IF;
  IF v_remaining > 0 THEN
    v_base := v_base + LEAST(v_remaining, 50) * (s->>'pts_guest_51_100')::INTEGER;
    v_remaining := GREATEST(0, v_remaining - 50);
  END IF;
  IF v_remaining > 0 THEN
    v_base := v_base + v_remaining * (s->>'pts_guest_100plus')::INTEGER;
  END IF;

  -- Arrangementbonus
  CASE p_event_type
    WHEN 'birthday'   THEN v_bonus := (s->>'bonus_birthday')::INTEGER;
    WHEN 'corporate'  THEN v_bonus := (s->>'bonus_corporate')::INTEGER;
    WHEN 'table'      THEN v_bonus := (s->>'bonus_table')::INTEGER;
    WHEN 'vip_event'  THEN v_bonus := (s->>'bonus_vip_event')::INTEGER;
    ELSE v_bonus := 0;
  END CASE;

  RETURN QUERY SELECT
    v_base,
    v_mult,
    v_bonus,
    ROUND(v_base * v_mult)::INTEGER + v_bonus;
END;
$$ LANGUAGE plpgsql;

-- 9. OPPDATER RANGERINGER
CREATE OR REPLACE FUNCTION refresh_rankings()
RETURNS VOID AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY total_points DESC) AS new_rank
    FROM profiles
    WHERE role = 'ambassador'
  )
  UPDATE profiles SET rank = ranked.new_rank
  FROM ranked WHERE profiles.id = ranked.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. ROW LEVEL SECURITY
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_settings      ENABLE ROW LEVEL SECURITY;

-- Profiler
CREATE POLICY "Alle innloggede kan se profiler"
  ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Kan oppdatere egen profil"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin kan oppdatere alle profiler"
  ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Gjesteregistreringer
CREATE POLICY "Se egne eller admin"
  ON guest_registrations FOR SELECT USING (
    auth.uid() = ambassador_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','staff'))
  );
CREATE POLICY "Staff kan registrere"
  ON guest_registrations FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','staff'))
  );

-- Omsetning
CREATE POLICY "Se egne eller admin"
  ON revenue_logs FOR SELECT USING (
    auth.uid() = ambassador_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','staff'))
  );
CREATE POLICY "Staff kan registrere omsetning"
  ON revenue_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','staff'))
  );

-- Bookinger
CREATE POLICY "Se egne bookinger eller admin"
  ON bookings FOR SELECT USING (
    auth.uid() = ambassador_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
CREATE POLICY "Ambassador kan opprette booking"
  ON bookings FOR INSERT WITH CHECK (auth.uid() = ambassador_id);
CREATE POLICY "Admin kan oppdatere bookinger"
  ON bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Poenginnstillinger
CREATE POLICY "Alle kan lese innstillinger"
  ON point_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Kun super_admin kan endre"
  ON point_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Weekly/monthly scores
CREATE POLICY "Alle kan se score"
  ON weekly_scores FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Alle kan se monthly score"
  ON monthly_scores FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- ETTER OPPSETT:
-- 1. Registrer deg som bruker på nettsiden
-- 2. Kjør denne linjen med din e-post for å bli super_admin:
--    UPDATE profiles SET role = 'super_admin', ambassador_code = 'SKINS-ADM'
--    WHERE email = 'din@epost.no';
-- ============================================================

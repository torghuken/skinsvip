// api/submit-vip-application.js
// Oppretter VIP-søknad + samtykke-rader SERVER-SIDE i samme kall (service-nøkkel, forbi RLS).
// Ingen anonym innsetting av consent fra nettleseren.
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    full_name, birth_date, gender, phone, email, avatar_url, motivation,
    policy_version, consent
  } = req.body || {};

  // Validering
  if (!full_name || !birth_date || !phone) return res.status(400).json({ error: 'Mangler påkrevde felt' });
  if (!consent || consent.privacy_ack !== true) return res.status(400).json({ error: 'Personvernerklæringen må bekreftes' });
  if (!policy_version) return res.status(400).json({ error: 'policy_version mangler' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server ikke konfigurert (service key)' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    SERVICE_KEY
  );

  const ua = (req.headers['user-agent'] || '').slice(0, 400);

  // 1) Opprett søknad
  const { data: app, error: appErr } = await sb.from('vip_applications').insert({
    full_name,
    birth_date,
    gender: gender || null,
    phone,
    email: email || null,
    avatar_url: avatar_url || null,
    motivation: motivation || null,
    status: 'pending'
  }).select('id').single();
  if (appErr) return res.status(500).json({ error: 'Søknad feilet: ' + appErr.message });

  // 2) Skriv samtykke-rader i SAMME kall, knyttet til søknaden (source='apply')
  const rows = [
    { application_id: app.id, consent_type: 'privacy_ack',     granted: true,                  policy_version, source: 'apply', user_agent: ua },
    { application_id: app.id, consent_type: 'marketing_sms',   granted: consent.sms === true,   policy_version, source: 'apply', user_agent: ua },
    { application_id: app.id, consent_type: 'marketing_email', granted: consent.email === true, policy_version, source: 'apply', user_agent: ua },
  ];
  const { error: cErr } = await sb.from('consent_events').insert(rows);
  if (cErr) {
    // Best-effort rollback: ikke etterlat en søknad uten samtykke
    await sb.from('vip_applications').delete().eq('id', app.id);
    return res.status(500).json({ error: 'Samtykke feilet: ' + cErr.message });
  }

  return res.status(200).json({ ok: true, application_id: app.id });
};

// api/save-consent.js
// Skriver samtykke-rader for INNLOGGET medlem server-side (service-nøkkel), verifisert via JWT.
// Same-origin fra vip.html → unngår kryss-origin CORS-preflight / Cloudflare-blokkering mot supabase.co.
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { access_token, policy_version, first_time, sms, email } = req.body || {};
  if (!access_token) return res.status(401).json({ error: 'Mangler token' });
  if (!policy_version) return res.status(400).json({ error: 'policy_version mangler' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server ikke konfigurert (service key)' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    SERVICE_KEY
  );

  // Verifiser brukeren ut fra JWT-et
  const { data: u, error: ue } = await sb.auth.getUser(access_token);
  if (ue || !u || !u.user) return res.status(401).json({ error: 'Ugyldig sesjon' });
  const uid = u.user.id;

  const ua = (req.headers['user-agent'] || '').slice(0, 400);
  const rows = [{ profile_id: uid, consent_type: 'privacy_ack', granted: true, policy_version, source: 'login', user_agent: ua }];
  if (first_time) {
    rows.push({ profile_id: uid, consent_type: 'marketing_sms',   granted: sms === true,   policy_version, source: 'login', user_agent: ua });
    rows.push({ profile_id: uid, consent_type: 'marketing_email', granted: email === true, policy_version, source: 'login', user_agent: ua });
  }

  const { error } = await sb.from('consent_events').insert(rows);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
};

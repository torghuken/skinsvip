// api/sms-reset.js — Send password reset link via SMS using Supabase Admin API
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Telefonnummer mangler.' });

  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 8) return res.status(400).json({ error: 'Ugyldig telefonnummer.' });

  const authEmail = digits + '@skinsvip.no';
  const SB_URL = process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server ikke konfigurert.' });

  const sb = createClient(SB_URL, SB_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // Generate password reset link using admin API
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email: authEmail,
    options: { redirectTo: (process.env.SITE_URL || 'https://skinsvip.vercel.app') + '/vip-reset.html' }
  });

  if (linkErr) {
    if (linkErr.message.includes('not found') || linkErr.message.includes('Unable to find')) {
      return res.status(404).json({ error: 'Ingen konto funnet med dette nummeret.' });
    }
    return res.status(500).json({ error: 'Kunne ikke generere reset-lenke.' });
  }

  // The generated link contains the token — send it via SMS
  const resetUrl = linkData?.properties?.action_link;
  if (!resetUrl) return res.status(500).json({ error: 'Kunne ikke generere reset-lenke.' });

  // Send SMS via Twilio
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const FROM = process.env.TWILIO_FROM_NUMBER;

  if (!SID || !TOKEN || (!MSID && !FROM)) {
    return res.status(500).json({ error: 'SMS ikke konfigurert.' });
  }

  const to = phone.startsWith('+') ? phone.replace(/\s/g, '') : '+47' + digits;
  const body = 'SKINS VIP: Klikk her for å tilbakestille passordet ditt:\n' + resetUrl;

  const params = { To: to, Body: body };
  if (MSID) params.MessagingServiceSid = MSID;
  else params.From = FROM;

  try {
    const smsRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(SID + ':' + TOKEN).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(params).toString()
    });
    const smsData = await smsRes.json();
    if (!smsRes.ok) return res.status(500).json({ error: 'SMS feilet: ' + (smsData.message || 'ukjent feil') });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'SMS feilet: ' + e.message });
  }
};

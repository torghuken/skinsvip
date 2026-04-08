// api/invite-ambassador.js — Generate invite token and send SMS
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, name, invited_by } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Telefonnummer mangler' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Generate unique token
  const token = crypto.randomUUID();

  // Insert invite
  const { error: insErr } = await sb.from('ambassador_invites').insert({
    token,
    phone,
    name: name || null,
    invited_by: invited_by || null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  if (insErr) {
    return res.status(500).json({ error: 'Kunne ikke opprette invitasjon: ' + insErr.message });
  }

  // Send SMS
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN_TW = process.env.TWILIO_AUTH_TOKEN;
  const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const FROM = process.env.TWILIO_FROM_NUMBER;

  const inviteUrl = 'https://skinsvip.no/amb-login.html?invite=' + token;
  const smsBody = `SKINS NightClub: Du er invitert som Ambassador! Registrer deg her: ${inviteUrl}`;

  const to = phone.startsWith('+') ? phone.replace(/\s/g, '') : '+47' + phone.replace(/[^0-9]/g, '');

  let smsSent = false;
  if (SID && TOKEN_TW && (MSID || FROM)) {
    try {
      const params = { To: to, Body: smsBody };
      if (MSID) params.MessagingServiceSid = MSID;
      else params.From = FROM;

      const smsRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(SID + ':' + TOKEN_TW).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(params).toString()
      });
      smsSent = smsRes.ok;
    } catch (e) {
      console.error('SMS feil:', e);
    }
  }

  return res.status(200).json({ ok: true, token, inviteUrl, smsSent });
};

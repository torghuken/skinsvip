// api/sms-notify.js
// Sends SMS via Twilio when a booking is submitted.
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, MANAGER_PHONE

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SID   = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM  = process.env.TWILIO_FROM_NUMBER;
  const TO    = process.env.MANAGER_PHONE;

  if (!SID || !TOKEN || !FROM || !TO) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'Twilio not configured' });
  }

  try {
    const { event_name, event_date, guest_count, ambassador_name, table_booking } = req.body || {};
    const msg = [
      '🎉 NY BOOKING – SKINS NightClub',
      'Ambassadør: ' + (ambassador_name || 'Ukjent'),
      'Event: ' + (event_name || '-'),
      'Dato: ' + (event_date || '-'),
      'Gjester: ' + (guest_count || '-'),
      table_booking ? 'Bordbooking: JA' : null,
      'Se portalen: skinsvip.vercel.app'
    ].filter(Boolean).join('\n');

    const body = new URLSearchParams({ To: TO, From: FROM, Body: msg });
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(SID + ':' + TOKEN).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: d.message, code: d.code });
    return res.status(200).json({ ok: true, sid: d.sid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
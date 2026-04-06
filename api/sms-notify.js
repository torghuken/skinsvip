// api/sms-notify.js – Sender SMS via Twilio med godkjenn/avvis-lenker
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SID   = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM  = process.env.TWILIO_FROM_NUMBER;
  const MSID  = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const TO    = process.env.MANAGER_PHONE;
  const KEY   = process.env.SUPABASE_SERVICE_KEY;
  const SB    = 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const BASE  = 'https://skinsvip.vercel.app';

  if (!SID || !TOKEN || !FROM || !TO)
    return res.status(200).json({ ok: true, skipped: true, reason: 'Twilio not configured' });

  try {
    const { event_name, event_date, guest_count, men, women, ambassador_name,
            table_type, expected_spend, notes, booking_id } = req.body || {};

    let approveLink = BASE + '/api/booking-action?action=godkjenn';
    let rejectLink  = BASE + '/api/booking-action?action=avvis';

    if (booking_id && KEY) {
      const tok = crypto.randomUUID();
      await fetch(SB + '/rest/v1/bookings?id=eq.' + booking_id, {
        method: 'PATCH',
        headers: {
          apikey: KEY, Authorization: 'Bearer ' + KEY,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ approval_token: tok })
      });
      approveLink = BASE + '/api/booking-action?token=' + tok + '&action=godkjenn';
      rejectLink  = BASE + '/api/booking-action?token=' + tok + '&action=avvis';
    }

    const dateStr = event_date ? new Date(event_date).toLocaleDateString('no-NO', { day:'numeric', month:'long', year:'numeric' }) : '-';
    const lines = [
      'NY BOOKING - SKINS NightClub',
      '',
      'Ambassadoer: ' + (ambassador_name || 'Ukjent'),
      'Event: '       + (event_name      || '-'),
      'Dato: '        + dateStr,
      'Gjester: '     + (guest_count || '-') + (men || women ? ' (' + (men||0) + ' menn, ' + (women||0) + ' kvinner)' : ''),
      table_type      ? 'Bordtype: ' + table_type.toUpperCase() : null,
      expected_spend  ? 'Forventet forbruk: ' + Number(expected_spend).toLocaleString('no') + ' kr' : null,
      notes           ? 'Notater: ' + notes : null,
      '',
      'Godkjenn: ' + approveLink,
      'Avvis: '    + rejectLink
    ].filter(l => l !== null).join('\n');

    const params = { To: TO, Body: lines };
    if (MSID) params.MessagingServiceSid = MSID;
    else params.From = FROM;
    const body = new URLSearchParams(params);
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

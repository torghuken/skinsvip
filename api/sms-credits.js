// api/sms-credits.js – Send SMS til ambassadør når credits tildeles
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

  if (!SID || !TOKEN || (!FROM && !MSID))
    return res.status(200).json({ ok: true, skipped: true });

  try {
    const { phone, name, amount, newTotal, custom } = req.body || {};
    if (!phone) return res.status(200).json({ ok: true, skipped: true, reason: 'no_phone' });

    const to = phone.startsWith('+') ? phone : '+47' + phone.replace(/\s/g, '');
    const body = custom || `SKINS NightClub\n\nHei ${name || 'Ambassador'}! Du har fatt ${amount} credits.\n\nDin nye saldo: ${newTotal} credits`;

    const params = { To: to, Body: body };
    if (MSID) params.MessagingServiceSid = MSID;
    else params.From = FROM;

    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(SID + ':' + TOKEN).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(params).toString()
    });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: d.message });
    return res.status(200).json({ ok: true, sid: d.sid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

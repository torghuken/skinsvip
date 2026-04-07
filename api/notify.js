export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = 'hrtorghuken@gmail.com';

  try {
    const body = req.body || {};
    const record = body.record || body;

    const ambassadorName = record.ambassador_name || 'Ukjent ambassador';
    const eventName = record.event_name || 'Ukjent arrangement';
    const eventDate = record.event_date || '-';
    const guestCount = record.guest_count || 0;
    const tableBooking = record.table_booking || 'Nei';
    const expectedSpend = record.expected_spend ? record.expected_spend + ' kr' : '-';
    const notes = record.notes || '-';

    const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;color:#fff;padding:28px;border-radius:12px;border:1px solid #222;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <span style="font-size:28px;">🎉</span>
    <h2 style="color:#C9A84C;margin:0;font-size:20px;">Ny booking – SKINS NightClub</h2>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:15px;">
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;width:40%;">Ambassador</td><td style="padding:10px 0;font-weight:600;">${ambassadorName}</td></tr>
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;">Arrangement</td><td style="padding:10px 0;">${eventName}</td></tr>
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;">Dato</td><td style="padding:10px 0;">${eventDate}</td></tr>
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;">Antall gjester</td><td style="padding:10px 0;">${guestCount}</td></tr>
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;">Bordbooking</td><td style="padding:10px 0;">${tableBooking}</td></tr>
    <tr style="border-bottom:1px solid #222;"><td style="padding:10px 0;color:#888;">Forventet forbruk</td><td style="padding:10px 0;">${expectedSpend}</td></tr>
    <tr><td style="padding:10px 0;color:#888;">Notat</td><td style="padding:10px 0;">${notes}</td></tr>
  </table>
  <div style="margin-top:24px;padding:14px;background:#1a1a1a;border-radius:8px;text-align:center;">
    <a href="https://skinsvip.no/admin.html" style="color:#C9A84C;text-decoration:none;font-weight:600;">
      Gå til admin-panelet for å godkjenne →
    </a>
  </div>
  <p style="margin-top:16px;font-size:12px;color:#444;text-align:center;">SKINS NightClub · skinsvip.no</p>
</div>`;

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SKINS VIP <onboarding@resend.dev>',
        to: [NOTIFY_EMAIL],
        subject: `🎉 Ny booking: ${eventName} – ${ambassadorName}`,
        html
      })
    });

    const result = await emailResp.json();
    return res.status(200).json({ ok: true, resend: result });
  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

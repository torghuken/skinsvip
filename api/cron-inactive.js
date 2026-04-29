// api/cron-inactive.js — Weekly check for inactive VIPs (no check-in in 14 days)
// Sends email alert to super-admin with list of inactive VIPs
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  // Get all VIPs
  const { data: vips } = await sb.from('profiles')
    .select('id, full_name, phone, email')
    .eq('role', 'vip');

  if (!vips || !vips.length) {
    return res.status(200).json({ ok: true, message: 'No VIPs found' });
  }

  // Get all check-ins in last 14 days
  const { data: recentCheckins } = await sb.from('check_ins')
    .select('profile_id')
    .gte('checked_in_at', fourteenDaysAgo);

  const activeSet = new Set((recentCheckins || []).map(c => c.profile_id));
  const inactive = vips.filter(v => !activeSet.has(v.id));

  if (!inactive.length) {
    return res.status(200).json({ ok: true, message: 'All VIPs active', total: vips.length });
  }

  // Send email alert
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'hrtorghuken@gmail.com';

  if (RESEND_KEY) {
    const list = inactive.map(v =>
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #222;">${v.full_name || '?'}</td><td style="padding:6px 12px;border-bottom:1px solid #222;">${v.phone || ''}</td><td style="padding:6px 12px;border-bottom:1px solid #222;">${v.email || ''}</td></tr>`
    ).join('');

    const html = `
      <div style="font-family:sans-serif;background:#0a0a0a;color:#fff;padding:24px;border-radius:12px;">
        <h2 style="color:#C9A040;">SKINS VIP — Inaktive VIP-er</h2>
        <p style="color:#888;">${inactive.length} av ${vips.length} VIP-er har ikke vært innom siste 14 dager:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <tr style="color:#C9A040;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
            <th style="padding:8px 12px;text-align:left;">Navn</th>
            <th style="padding:8px 12px;text-align:left;">Telefon</th>
            <th style="padding:8px 12px;text-align:left;">E-post</th>
          </tr>
          ${list}
        </table>
      </div>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SKINS VIP <noreply@skinsvip.no>',
          to: [NOTIFY_EMAIL],
          subject: `SKINS: ${inactive.length} inaktive VIP-er siste 14 dager`,
          html
        })
      });
    } catch(e) { /* email is best-effort */ }
  }

  return res.status(200).json({
    ok: true,
    inactive: inactive.length,
    total: vips.length,
    names: inactive.map(v => v.full_name)
  });
};

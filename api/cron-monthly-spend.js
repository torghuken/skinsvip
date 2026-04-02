// api/cron-monthly-spend.js
// Runs on 1st of each month: snapshots VIP monthly_spend, then resets to 0.
// Trigger via Vercel Cron or manual GET /api/cron-monthly-spend?key=SECRET
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Simple auth: check cron secret or Vercel cron header
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const queryKey = req.query?.key;
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManual = queryKey && queryKey === cronSecret;

  if (cronSecret && !isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    // Determine which month to snapshot (previous month)
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = prevMonth.toISOString().slice(0, 7); // e.g. '2026-03'

    // Get all VIP profiles with spend > 0
    const { data: vips, error: fetchErr } = await sb
      .from('profiles')
      .select('id, monthly_spend, full_name')
      .eq('role', 'vip')
      .gt('monthly_spend', 0);

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!vips || vips.length === 0) {
      return res.status(200).json({ ok: true, message: 'No VIP spend to snapshot', month: monthStr });
    }

    // Insert snapshots (upsert to avoid duplicates)
    const rows = vips.map(v => ({
      profile_id: v.id,
      month: monthStr,
      spend: v.monthly_spend || 0
    }));

    const { error: insertErr } = await sb
      .from('vip_monthly_spend')
      .upsert(rows, { onConflict: 'profile_id,month' });

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    // Reset monthly_spend to 0 for all VIPs
    const { error: resetErr } = await sb
      .from('profiles')
      .update({ monthly_spend: 0 })
      .eq('role', 'vip');

    if (resetErr) return res.status(500).json({ error: 'Snapshot OK but reset failed: ' + resetErr.message });

    return res.status(200).json({
      ok: true,
      month: monthStr,
      snapshotted: vips.length,
      details: vips.map(v => ({ name: v.full_name, spend: v.monthly_spend }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

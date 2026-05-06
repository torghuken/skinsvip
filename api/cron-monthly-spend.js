// api/cron-monthly-spend.js
// Runs 1st of each month: snapshot monthly_spend for VIP + ambassadors, snapshot monthly_scores, then reset
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

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
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = prevMonth.toISOString().slice(0, 7); // e.g. '2026-04'
    const year = prevMonth.getFullYear();
    const month = prevMonth.getMonth() + 1;

    // Get start/end of previous month for querying registrations
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEnd = new Date(year, month, 1).toISOString();

    // ── 1. Snapshot VIP monthly_spend ──
    const { data: vips } = await sb.from('profiles')
      .select('id, monthly_spend, full_name')
      .eq('role', 'vip')
      .gt('monthly_spend', 0);

    if (vips && vips.length) {
      await sb.from('vip_monthly_spend').upsert(
        vips.map(v => ({ profile_id: v.id, month: monthStr, spend: v.monthly_spend || 0 })),
        { onConflict: 'profile_id,month' }
      );
    }

    // ── 2. Reset monthly_spend for ALL roles (VIP + ambassador) ──
    await sb.from('profiles')
      .update({ monthly_spend: 0 })
      .in('role', ['vip', 'ambassador'])
      .gt('monthly_spend', 0);

    // ── 3. Snapshot monthly_scores for all ambassadors + VIPs ──
    const { data: allProfiles } = await sb.from('profiles')
      .select('id')
      .in('role', ['ambassador', 'vip']);

    if (allProfiles && allProfiles.length) {
      // Get guest registrations for the month
      const { data: gRegs } = await sb.from('guest_registrations')
        .select('ambassador_id, guest_count, total_points')
        .gte('registered_at', monthStart)
        .lt('registered_at', monthEnd);

      // Get bar registrations for the month
      const { data: bRegs } = await sb.from('bar_registrations')
        .select('ambassador_id, amount')
        .gte('registered_at', monthStart)
        .lt('registered_at', monthEnd);

      // Aggregate per profile
      const agg = {};
      allProfiles.forEach(p => { agg[p.id] = { points: 0, guests: 0, revenue: 0 }; });
      (gRegs || []).forEach(g => {
        if (agg[g.ambassador_id]) {
          agg[g.ambassador_id].points += (g.total_points || 0);
          agg[g.ambassador_id].guests += (g.guest_count || 0);
        }
      });
      (bRegs || []).forEach(b => {
        if (agg[b.ambassador_id]) {
          agg[b.ambassador_id].revenue += (b.amount || 0);
        }
      });

      // Find winner (highest points)
      let maxPts = 0;
      let winnerId = null;
      Object.entries(agg).forEach(([id, a]) => {
        if (a.points > maxPts) { maxPts = a.points; winnerId = id; }
      });

      const rows = Object.entries(agg)
        .filter(([, a]) => a.points > 0 || a.guests > 0 || a.revenue > 0)
        .map(([id, a]) => ({
          ambassador_id: id,
          year, month,
          points: a.points,
          guests: a.guests,
          revenue: a.revenue,
          is_winner: id === winnerId
        }));

      if (rows.length) {
        await sb.from('monthly_scores').upsert(rows, { onConflict: 'ambassador_id,year,month' });
      }
    }

    return res.status(200).json({
      ok: true, month: monthStr,
      vip_snapshotted: (vips || []).length,
      monthly_scores: 'done'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

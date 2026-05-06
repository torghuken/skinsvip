// api/cron-weekly-scores.js
// Runs Sunday 09:00: snapshot weekly scores for ambassadors + VIPs
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Previous week: Monday to Sunday
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
    lastMonday.setHours(0, 0, 0, 0);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 7);

    const weekStart = lastMonday.toISOString().split('T')[0];
    const weekEnd = lastSunday.toISOString().split('T')[0];
    const weekStartISO = lastMonday.toISOString();
    const weekEndISO = lastSunday.toISOString();

    // Get all profiles
    const { data: allProfiles } = await sb.from('profiles')
      .select('id')
      .in('role', ['ambassador', 'vip']);

    if (!allProfiles || !allProfiles.length) {
      return res.status(200).json({ ok: true, message: 'No profiles found' });
    }

    // Get registrations for the week
    const [gRegs, bRegs] = await Promise.all([
      sb.from('guest_registrations')
        .select('ambassador_id, guest_count, total_points')
        .gte('registered_at', weekStartISO)
        .lt('registered_at', weekEndISO),
      sb.from('bar_registrations')
        .select('ambassador_id, amount')
        .gte('registered_at', weekStartISO)
        .lt('registered_at', weekEndISO)
    ]);

    // Aggregate per profile
    const agg = {};
    allProfiles.forEach(p => { agg[p.id] = { points: 0, guests: 0, revenue: 0 }; });
    (gRegs.data || []).forEach(g => {
      if (agg[g.ambassador_id]) {
        agg[g.ambassador_id].points += (g.total_points || 0);
        agg[g.ambassador_id].guests += (g.guest_count || 0);
      }
    });
    (bRegs.data || []).forEach(b => {
      if (agg[b.ambassador_id]) {
        agg[b.ambassador_id].revenue += (b.amount || 0);
      }
    });

    // Find winner
    let maxPts = 0, winnerId = null;
    Object.entries(agg).forEach(([id, a]) => {
      if (a.points > maxPts) { maxPts = a.points; winnerId = id; }
    });

    const rows = Object.entries(agg)
      .filter(([, a]) => a.points > 0 || a.guests > 0 || a.revenue > 0)
      .map(([id, a]) => ({
        ambassador_id: id,
        week_start: weekStart,
        week_end: weekEnd,
        points: a.points,
        guests: a.guests,
        revenue: a.revenue,
        is_winner: id === winnerId
      }));

    if (rows.length) {
      await sb.from('weekly_scores').upsert(rows, { onConflict: 'ambassador_id,week_start' });
    }

    return res.status(200).json({
      ok: true,
      week: weekStart + ' → ' + weekEnd,
      scored: rows.length,
      winner: winnerId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

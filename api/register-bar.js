// api/register-bar.js — Register bar revenue with service_role (bypasses RLS)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ambassador_id, ambassador_name, amount } = req.body || {};
  if (!ambassador_id || !amount || amount < 1) {
    return res.status(400).json({ error: 'ambassador_id and amount required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Load point settings
  const { data: settings } = await sb.from('point_settings').select('key, value');
  const ps = {};
  (settings || []).forEach(s => { ps[s.key] = parseFloat(s.value); });

  // Calculate points with bar multiplier
  const ptsPerHundred = ps.pts_revenue_100 || 1;
  const basePts = Math.floor(amount / 100) * ptsPerHundred;

  let mult = 1;
  if (amount >= 3500) mult = ps.mult_bar_3500 || 10;
  else if (amount >= 2500) mult = ps.mult_bar_2500 || 8;
  else if (amount >= 1500) mult = ps.mult_bar_1500 || 6;
  else if (amount >= 1000) mult = ps.mult_bar_1000 || 4;
  else if (amount >= 500) mult = ps.mult_bar_500 || 2;

  const pts = basePts * mult;

  const creditsPerPts = ps.credits_per_points || 100;
  const maxCredits = ps.credits_max_night || 25;
  const credits = Math.min(Math.floor(pts / creditsPerPts), maxCredits);

  // Insert bar_registrations
  const { error: insErr } = await sb.from('bar_registrations').insert({
    ambassador_id,
    ambassador_name: ambassador_name || null,
    amount,
    base_points: pts,
    credits_earned: credits,
    registered_at: new Date().toISOString()
  });

  if (insErr) {
    return res.status(500).json({ error: 'bar_registrations insert failed: ' + insErr.message });
  }

  // Update profile
  const { data: fresh, error: fetchErr } = await sb.from('profiles')
    .select('total_points, total_revenue, credits, monthly_spend')
    .eq('id', ambassador_id)
    .single();

  if (fetchErr || !fresh) {
    return res.status(500).json({ error: 'Could not fetch profile: ' + (fetchErr?.message || 'not found') });
  }

  const newPts = (fresh.total_points || 0) + pts;
  const newRevenue = (fresh.total_revenue || 0) + amount;
  const newCredits = Math.min((fresh.credits || 0) + credits, 999);
  const newMonthly = (fresh.monthly_spend || 0) + amount;

  const { error: updErr } = await sb.from('profiles').update({
    total_points: newPts,
    total_revenue: newRevenue,
    credits: newCredits,
    monthly_spend: newMonthly
  }).eq('id', ambassador_id);

  if (updErr) {
    return res.status(500).json({ error: 'Profile update failed: ' + updErr.message });
  }

  return res.status(200).json({
    ok: true,
    pts,
    mult,
    credits,
    newPts,
    newRevenue,
    newMonthly,
    newCredits
  });
};

// api/register-guests.js — Register guests with service_role (bypasses RLS)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ambassador_id, ambassador_name, guest_count, event_type } = req.body || {};
  if (!ambassador_id || !guest_count || guest_count < 1) {
    return res.status(400).json({ error: 'ambassador_id and guest_count required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Load point settings
  const { data: settings } = await sb.from('point_settings').select('key, value');
  const ps = {};
  (settings || []).forEach(s => { ps[s.key] = parseFloat(s.value); });

  // Calculate points — flat 10 pts per guest × time multiplier
  const ptsPerGuest = ps.pts_per_guest || 10;
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const timeVal = hour * 60 + min;

  let mult = ps.mult_after_0000 || 1;
  if (timeVal < 23 * 60) mult = ps.mult_before_2300 || 3;
  else if (timeVal < 23 * 60 + 30) mult = ps.mult_2300_2330 || 2;
  else if (timeVal < 24 * 60) mult = ps.mult_2330_0000 || 1.5;

  const pts = Math.round(guest_count * ptsPerGuest * mult);

  const creditsPerPts = ps.credits_per_points || 100;
  const maxCredits = ps.credits_max_night || 25;
  const credits = Math.min(Math.floor(pts / creditsPerPts), maxCredits);

  // Insert guest_registrations
  const { error: insErr } = await sb.from('guest_registrations').insert({
    ambassador_id,
    guest_count,
    event_type: event_type || 'regular',
    time_multiplier: mult,
    total_points: pts,
    registered_at: now.toISOString()
  });

  if (insErr) {
    return res.status(500).json({ error: 'guest_registrations insert failed: ' + insErr.message });
  }

  // Update profile
  const { data: fresh, error: fetchErr } = await sb.from('profiles')
    .select('total_points, total_guests, credits, monthly_spend, role')
    .eq('id', ambassador_id)
    .single();

  if (fetchErr || !fresh) {
    return res.status(500).json({ error: 'Could not fetch profile: ' + (fetchErr?.message || 'not found') });
  }

  const newPts = (fresh.total_points || 0) + pts;
  const newGuests = (fresh.total_guests || 0) + guest_count;
  const newCredits = Math.min((fresh.credits || 0) + credits, 999);
  const newMonthly = (fresh.monthly_spend || 0) + pts;

  const update = {
    total_points: newPts,
    total_guests: newGuests,
    credits: newCredits,
    monthly_spend: newMonthly,
  };

  const { error: updErr } = await sb.from('profiles').update(update).eq('id', ambassador_id);

  if (updErr) {
    return res.status(500).json({ error: 'Profile update failed: ' + updErr.message });
  }

  return res.status(200).json({
    ok: true,
    pts,
    mult,
    credits,
    guest_count,
    newPts,
    newGuests,
    newCredits
  });
};

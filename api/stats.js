// api/stats.js — Aggregated statistics for super-admin
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { days = 7, ranking = 'visits' } = req.body || {};
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Parallel queries
  const [checkIns, guestRegs, barRegs, shares, credits, profiles] = await Promise.all([
    sb.from('check_ins').select('profile_id').gte('checked_in_at', since),
    sb.from('guest_registrations').select('ambassador_id, guest_count, total_points').gte('registered_at', since),
    sb.from('bar_registrations').select('ambassador_id, amount').gte('registered_at', since),
    sb.from('social_shares').select('user_id').gte('shared_at', since),
    sb.from('time_credits').select('ambassador_id, amount, remaining').gte('created_at', since),
    sb.from('profiles').select('id, full_name, role, avatar_url')
  ]);

  // Try poll_votes (may not exist or have different schema)
  let votes = { data: [] };
  try {
    votes = await sb.from('poll_votes').select('profile_id').gte('created_at', since);
  } catch(e) { /* table may not exist */ }

  // Build profile map
  const pMap = {};
  (profiles.data || []).forEach(p => {
    pMap[p.id] = { name: p.full_name, role: p.role, avatar_url: p.avatar_url, visits: 0, spend: 0, guests: 0, social: 0, polls: 0, credits_used: 0 };
  });

  // Aggregate
  (checkIns.data || []).forEach(c => { if (pMap[c.profile_id]) pMap[c.profile_id].visits++; });
  (guestRegs.data || []).forEach(g => { if (pMap[g.ambassador_id]) pMap[g.ambassador_id].guests += (g.guest_count || 0); });
  (barRegs.data || []).forEach(b => { if (pMap[b.ambassador_id]) pMap[b.ambassador_id].spend += (b.amount || 0); });
  (shares.data || []).forEach(s => { if (pMap[s.user_id]) pMap[s.user_id].social++; });
  (votes.data || []).forEach(v => { const id = v.profile_id || v.user_id; if (id && pMap[id]) pMap[id].polls++; });
  (credits.data || []).forEach(c => { if (pMap[c.ambassador_id]) pMap[c.ambassador_id].credits_used += ((c.amount || 0) - (c.remaining || 0)); });

  // Compute averages and build rankings
  const users = Object.entries(pMap)
    .filter(([, u]) => u.visits > 0 || u.spend > 0 || u.guests > 0 || u.social > 0 || u.polls > 0 || u.credits_used > 0)
    .map(([id, u]) => {
      // Normalize for average: each metric 0-100 scale
      const maxV = Math.max(...Object.values(pMap).map(x => x.visits), 1);
      const maxS = Math.max(...Object.values(pMap).map(x => x.spend), 1);
      const maxG = Math.max(...Object.values(pMap).map(x => x.guests), 1);
      const avg = Math.round(((u.visits / maxV) + (u.spend / maxS) + (u.guests / maxG)) / 3 * 100);
      return { id, ...u, average: avg };
    });

  // Sort by ranking
  users.sort((a, b) => (b[ranking] || 0) - (a[ranking] || 0));

  const rankings = users.map(u => ({
    name: u.name,
    role: u.role,
    avatar_url: u.avatar_url,
    value: ranking === 'average' ? u.average : u[ranking] || 0
  }));

  // Summary totals
  const summary = {
    check_ins: (checkIns.data || []).length,
    guests: (guestRegs.data || []).reduce((s, g) => s + (g.guest_count || 0), 0),
    revenue: (barRegs.data || []).reduce((s, b) => s + (b.amount || 0), 0),
    shares: (shares.data || []).length,
    votes: (votes.data || []).length,
    credits_used: (credits.data || []).reduce((s, c) => s + ((c.amount || 0) - (c.remaining || 0)), 0)
  };

  return res.status(200).json({ rankings, summary });
};

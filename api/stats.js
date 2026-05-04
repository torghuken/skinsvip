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
  const [checkIns, guestRegs, barRegs, shares, credits, profiles, bookings] = await Promise.all([
    sb.from('check_ins').select('profile_id, checked_in_at, checked_in_by').gte('checked_in_at', since),
    sb.from('guest_registrations').select('ambassador_id, guest_count, total_points, male_count, female_count, registered_by, registered_at').gte('registered_at', since),
    sb.from('bar_registrations').select('ambassador_id, amount, registered_by, registered_at').gte('registered_at', since),
    sb.from('social_shares').select('user_id').gte('shared_at', since),
    sb.from('time_credits').select('ambassador_id, amount, remaining').gte('created_at', since),
    sb.from('profiles').select('id, full_name, role, avatar_url'),
    sb.from('bookings').select('id, ambassador_id, status, checked_in, actual_guests').gte('created_at', since)
  ]);

  // Try poll_votes
  let votes = { data: [] };
  try { votes = await sb.from('poll_votes').select('profile_id').gte('created_at', since); } catch(e) {}

  // Conversion funnel — all-time counts from vip_applications
  let funnel = { applied: 0, approved: 0, setup_complete: 0, rejected: 0, visited: 0, regulars: 0 };
  try {
    const { data: apps } = await sb.from('vip_applications').select('id, status');
    if (apps) {
      funnel.applied = apps.length;
      funnel.approved = apps.filter(a => a.status === 'approved').length;
      funnel.setup_complete = apps.filter(a => a.status === 'setup_complete').length;
      funnel.rejected = apps.filter(a => a.status === 'rejected').length;
    }
    // How many VIPs have ever checked in?
    const { data: vipProfiles } = await sb.from('profiles').select('id').eq('role', 'vip');
    if (vipProfiles) {
      const { data: allCheckins } = await sb.from('check_ins').select('profile_id');
      const checkinSet = new Set((allCheckins || []).map(c => c.profile_id));
      funnel.visited = vipProfiles.filter(v => checkinSet.has(v.id)).length;

      // Regulars: 3+ check-ins
      const counts = {};
      (allCheckins || []).forEach(c => { counts[c.profile_id] = (counts[c.profile_id] || 0) + 1; });
      funnel.regulars = vipProfiles.filter(v => (counts[v.id] || 0) >= 3).length;
    }
  } catch(e) {}

  // Build profile map
  const pMap = {};
  (profiles.data || []).forEach(p => {
    pMap[p.id] = { name: p.full_name, role: p.role, avatar_url: p.avatar_url,
      visits: 0, spend: 0, guests: 0, social: 0, polls: 0, credits_used: 0, avg_spend: 0 };
  });

  // Aggregate per user
  (checkIns.data || []).forEach(c => { if (pMap[c.profile_id]) pMap[c.profile_id].visits++; });
  (guestRegs.data || []).forEach(g => { if (pMap[g.ambassador_id]) pMap[g.ambassador_id].guests += (g.guest_count || 0); });
  (barRegs.data || []).forEach(b => { if (pMap[b.ambassador_id]) pMap[b.ambassador_id].spend += (b.amount || 0); });
  (shares.data || []).forEach(s => { if (pMap[s.user_id]) pMap[s.user_id].social++; });
  (votes.data || []).forEach(v => { const id = v.profile_id || v.user_id; if (id && pMap[id]) pMap[id].polls++; });
  (credits.data || []).forEach(c => { if (pMap[c.ambassador_id]) pMap[c.ambassador_id].credits_used += ((c.amount || 0) - (c.remaining || 0)); });

  // Compute avg_spend per visit
  Object.values(pMap).forEach(u => {
    u.avg_spend = u.visits > 0 ? Math.round(u.spend / u.visits) : 0;
  });

  // Build rankings
  const users = Object.entries(pMap)
    .filter(([, u]) => u.visits > 0 || u.spend > 0 || u.guests > 0 || u.social > 0 || u.polls > 0 || u.credits_used > 0)
    .map(([id, u]) => {
      const maxV = Math.max(...Object.values(pMap).map(x => x.visits), 1);
      const maxS = Math.max(...Object.values(pMap).map(x => x.spend), 1);
      const maxG = Math.max(...Object.values(pMap).map(x => x.guests), 1);
      const avg = Math.round(((u.visits / maxV) + (u.spend / maxS) + (u.guests / maxG)) / 3 * 100);
      return { id, ...u, average: avg };
    });

  users.sort((a, b) => (b[ranking] || 0) - (a[ranking] || 0));

  const rankings = users.map(u => ({
    name: u.name, role: u.role, avatar_url: u.avatar_url,
    value: ranking === 'average' ? u.average : u[ranking] || 0
  }));

  // Peak hours (18-06 range)
  const hourCounts = {};
  for (let h = 0; h < 24; h++) hourCounts[h] = 0;
  (checkIns.data || []).forEach(c => {
    const h = new Date(new Date(c.checked_in_at).toLocaleString('en-US', { timeZone: 'Europe/Oslo' })).getHours();
    hourCounts[h]++;
  });
  (guestRegs.data || []).forEach(g => {
    const h = new Date(new Date(g.registered_at).toLocaleString('en-US', { timeZone: 'Europe/Oslo' })).getHours();
    hourCounts[h] += (g.guest_count || 1);
  });
  // Reorder: 18,19,20,...,23,0,1,2,3,4,5
  const peakHours = [];
  for (let h = 18; h < 24; h++) peakHours.push({ hour: h + ':00', count: hourCounts[h] });
  for (let h = 0; h <= 5; h++) peakHours.push({ hour: (h < 10 ? '0' : '') + h + ':00', count: hourCounts[h] });

  // Staff activity
  const staffActivity = {};
  (checkIns.data || []).forEach(c => {
    const by = c.checked_in_by || 'Ukjent';
    staffActivity[by] = (staffActivity[by] || 0) + 1;
  });
  (guestRegs.data || []).forEach(g => {
    if (g.registered_by) staffActivity[g.registered_by] = (staffActivity[g.registered_by] || 0) + 1;
  });
  (barRegs.data || []).forEach(b => {
    if (b.registered_by) staffActivity[b.registered_by] = (staffActivity[b.registered_by] || 0) + 1;
  });

  // Gender stats
  const totalMale = (guestRegs.data || []).reduce((s, g) => s + (g.male_count || 0), 0);
  const totalFemale = (guestRegs.data || []).reduce((s, g) => s + (g.female_count || 0), 0);

  // Booking show-up rate
  const approvedBookings = (bookings.data || []).filter(b => b.status === 'approved');
  const attendedBookings = approvedBookings.filter(b => b.checked_in);

  // Summary
  const summary = {
    check_ins: (checkIns.data || []).length,
    guests: (guestRegs.data || []).reduce((s, g) => s + (g.guest_count || 0), 0),
    revenue: (barRegs.data || []).reduce((s, b) => s + (b.amount || 0), 0),
    shares: (shares.data || []).length,
    votes: (votes.data || []).length,
    credits_used: (credits.data || []).reduce((s, c) => s + ((c.amount || 0) - (c.remaining || 0)), 0),
    male: totalMale,
    female: totalFemale,
    bookings_approved: approvedBookings.length,
    bookings_attended: attendedBookings.length,
    show_up_rate: approvedBookings.length > 0 ? Math.round(attendedBookings.length / approvedBookings.length * 100) : 0
  };

  return res.status(200).json({
    rankings, summary, peakHours, staffActivity, funnel
  });
};

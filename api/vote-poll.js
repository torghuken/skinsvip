// api/vote-poll.js — Cast vote + award points (service_role bypasses RLS)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require auth token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { poll_id, profile_id, option_index } = req.body || {};
  if (!poll_id || !profile_id || option_index === undefined) {
    return res.status(400).json({ error: 'poll_id, profile_id and option_index required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Verify the auth token matches the profile_id
  const anonSb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzbHB3eHpyY3ZvYnllY2N3b2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjgzMDgsImV4cCI6MjA5MDIwNDMwOH0.4JWT-rs_C6jvldiKNSCkhxAQYuhGa00teIviIw--cmI'
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await anonSb.auth.getUser(token);
  if (authErr || !user || user.id !== profile_id) {
    return res.status(401).json({ error: 'Ugyldig autentisering' });
  }

  // Check poll is still open
  const { data: poll, error: pollErr } = await sb.from('polls')
    .select('id, closes_at, options')
    .eq('id', poll_id)
    .single();

  if (pollErr || !poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  if (new Date(poll.closes_at) < new Date()) {
    return res.status(400).json({ error: 'Poll is closed' });
  }

  // Check not already voted
  const { data: existing } = await sb.from('poll_votes')
    .select('id')
    .eq('poll_id', poll_id)
    .eq('profile_id', profile_id)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'Already voted' });
  }

  // Insert vote
  const { error: voteErr } = await sb.from('poll_votes').insert({
    poll_id,
    profile_id,
    option_index
  });

  if (voteErr) {
    return res.status(500).json({ error: 'Vote failed: ' + voteErr.message });
  }

  // Award points — VIP: 100, Ambassador: 50
  const { data: profile } = await sb.from('profiles')
    .select('total_points, monthly_spend, role')
    .eq('id', profile_id)
    .single();
  const VOTE_POINTS = profile?.role === 'vip' ? 100 : 50;

  if (profile) {
    await sb.from('profiles').update({
      total_points: (profile.total_points || 0) + VOTE_POINTS,
      monthly_spend: (profile.monthly_spend || 0) + VOTE_POINTS,
    }).eq('id', profile_id);
  }

  // Get updated vote counts
  const { data: allVotes } = await sb.from('poll_votes')
    .select('option_index')
    .eq('poll_id', poll_id);

  const counts = {};
  (allVotes || []).forEach(v => {
    counts[v.option_index] = (counts[v.option_index] || 0) + 1;
  });

  return res.status(200).json({
    ok: true,
    points_awarded: VOTE_POINTS,
    counts
  });
};

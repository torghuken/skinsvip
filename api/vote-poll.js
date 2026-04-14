// api/vote-poll.js — Cast vote + award points (service_role bypasses RLS)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poll_id, profile_id, option_index } = req.body || {};
  if (!poll_id || !profile_id || option_index === undefined) {
    return res.status(400).json({ error: 'poll_id, profile_id and option_index required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

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

  // Award +50 points
  const VOTE_POINTS = 50;
  const { data: profile } = await sb.from('profiles')
    .select('total_points, monthly_spend')
    .eq('id', profile_id)
    .single();

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

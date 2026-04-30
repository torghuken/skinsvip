// api/log-share.js — Log social share + award 100 points (max 1 per post per user)
const { createClient } = require('@supabase/supabase-js');

const SHARE_POINTS = 100;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Verify user
  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { platform, post_url } = req.body || {};
  if (!platform || !post_url) return res.status(400).json({ error: 'Missing platform or post_url' });

  // Check if already shared this post
  const { data: existing } = await sb.from('social_shares')
    .select('id')
    .eq('user_id', user.id)
    .eq('post_url', post_url)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(200).json({ ok: true, already_shared: true, points: 0 });
  }

  // Log share
  await sb.from('social_shares').insert({ user_id: user.id, platform, post_url });

  // Award points — VIP: 100, Ambassador: 50
  const { data: profile } = await sb.from('profiles')
    .select('total_points, monthly_spend, role')
    .eq('id', user.id)
    .single();

  const pts = profile?.role === 'vip' ? 100 : 50;
  if (profile) {
    await sb.from('profiles').update({
      total_points: (profile.total_points || 0) + pts,
      monthly_spend: (profile.monthly_spend || 0) + pts,
    }).eq('id', user.id);
  }

  return res.status(200).json({ ok: true, points: pts });
};

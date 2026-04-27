// api/social-feed.js — Return cached Instagram posts + upcoming Facebook events
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Latest 6 Instagram posts
  const { data: posts } = await sb.from('instagram_posts')
    .select('id, caption, media_type, media_url, thumbnail_url, permalink, timestamp')
    .order('timestamp', { ascending: false })
    .limit(6);

  // Upcoming Facebook events (future only)
  const { data: events } = await sb.from('facebook_events')
    .select('id, name, description, start_time, end_time, cover_url, place_name')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(3);

  return res.status(200).json({
    posts: posts || [],
    events: events || []
  });
};

// api/sync-social.js — Sync Instagram posts + Facebook events from Meta Graph API
const { createClient } = require('@supabase/supabase-js');

const IG_ACCOUNT_ID = '17841460998756718';
const FB_PAGE_ID = '110860505263552';
const GRAPH_VERSION = 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const results = { instagram: 0, events: 0, errors: [] };

  // ── Sync Instagram posts ──
  try {
    const igUrl = `${GRAPH_BASE}/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${token}`;
    const igRes = await fetch(igUrl);
    const igData = await igRes.json();

    if (igData.error) {
      results.errors.push('Instagram: ' + igData.error.message);
    } else if (igData.data) {
      for (const post of igData.data) {
        await sb.from('instagram_posts').upsert({
          id: post.id,
          caption: post.caption || null,
          media_type: post.media_type,
          media_url: post.media_url,
          thumbnail_url: post.thumbnail_url || null,
          permalink: post.permalink,
          timestamp: post.timestamp,
          synced_at: new Date().toISOString()
        }, { onConflict: 'id' });
        results.instagram++;
      }
    }
  } catch (e) {
    results.errors.push('Instagram fetch: ' + e.message);
  }

  // ── Sync Facebook events ──
  try {
    const evUrl = `${GRAPH_BASE}/${FB_PAGE_ID}/events?fields=id,name,description,start_time,end_time,cover,place&limit=10&access_token=${token}`;
    const evRes = await fetch(evUrl);
    const evData = await evRes.json();

    if (evData.error) {
      results.errors.push('Events: ' + evData.error.message);
    } else if (evData.data) {
      for (const ev of evData.data) {
        await sb.from('facebook_events').upsert({
          id: ev.id,
          name: ev.name,
          description: ev.description || null,
          start_time: ev.start_time,
          end_time: ev.end_time || null,
          cover_url: ev.cover ? ev.cover.source : null,
          place_name: ev.place ? ev.place.name : null,
          synced_at: new Date().toISOString()
        }, { onConflict: 'id' });
        results.events++;
      }
    }
  } catch (e) {
    results.errors.push('Events fetch: ' + e.message);
  }

  return res.status(200).json({
    ok: true,
    synced: results,
    timestamp: new Date().toISOString()
  });
};

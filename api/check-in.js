// api/check-in.js — Log check-in when QR code is scanned at the door
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profile_id, checked_in_by } = req.body || {};
  if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const now = new Date();

  // Duplicate prevention: skip if same profile checked in within last 6 hours
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb.from('check_ins')
    .select('id')
    .eq('profile_id', profile_id)
    .gte('checked_in_at', sixHoursAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const { error } = await sb.from('check_ins').insert({
    profile_id,
    checked_in_by: checked_in_by || null,
    checked_in_at: now.toISOString(),
    session_date: now.toISOString().split('T')[0]
  });

  if (error) return res.status(500).json({ error: 'Check-in failed: ' + error.message });

  return res.status(200).json({ ok: true, duplicate: false });
};

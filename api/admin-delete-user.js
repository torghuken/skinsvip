// api/admin-delete-user.js — Super admin: deactivate or hard-delete a user
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, action } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id mangler' });
  if (!['delete', 'deactivate'].includes(action)) return res.status(400).json({ error: 'Ugyldig action' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Mangler auth-token' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Ugyldig session' });
  const callerId = userData.user.id;

  const { data: caller } = await sb.from('profiles').select('role').eq('id', callerId).single();
  if (caller?.role !== 'super_admin') return res.status(403).json({ error: 'Krever super_admin' });

  if (callerId === user_id) return res.status(400).json({ error: 'Kan ikke slette deg selv' });

  if (action === 'deactivate') {
    const { error } = await sb.from('profiles').update({ role: 'inactive' }).eq('id', user_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } else {
    const { data, error } = await sb.from('profiles').delete().eq('id', user_id).select();
    if (error) {
      if (error.code === '23503' || /foreign key/i.test(error.message)) {
        return res.status(409).json({ error: 'Har historikk. Bruk Deaktiver.' });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data || !data.length) return res.status(404).json({ error: 'Bruker ikke funnet' });
    return res.status(200).json({ ok: true });
  }
};

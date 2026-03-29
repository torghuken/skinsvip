// api/push-subscribe.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const SK     = process.env.SUPABASE_SERVICE_KEY;
  const hdrs   = { 'Content-Type':'application/json', apikey: SK, Authorization:'Bearer '+SK, Prefer:'return=minimal' };

  try {
    if (req.method === 'POST') {
      const { subscription, role } = req.body || {};
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription' });
      const r = await fetch(SB_URL + '/rest/v1/push_subscriptions', {
        method: 'POST',
        headers: { ...hdrs, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh,
          auth: subscription.keys?.auth,
          role: role || 'manager',
          updated_at: new Date().toISOString()
        })
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const { endpoint } = req.body || {};
      await fetch(SB_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method:'DELETE', headers: hdrs });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
}
// api/register-credits.js
// Vercel serverless function — runs server-side so it can use the Supabase
// service-role key (which bypasses RLS) to write credits on behalf of door/bar staff.
//
// Required Vercel env vars (add in Vercel dashboard → Settings → Environment Variables):
//   SUPABASE_URL          = https://hslpwxzrcvobyeccwoao.supabase.co
//   SUPABASE_SERVICE_KEY  = <your service-role key from Supabase dashboard → API>

export default async function handler(req, res) {
  // Allow CORS from the same origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY env var not set in Vercel' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY,
    'Prefer': 'return=representation'
  };

  try {
    const body = req.body || {};
    const { ambassador_id, type, amount, count, description, staff_id, multiplier } = body;

    if (!ambassador_id || !type || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields: ambassador_id, type, amount' });
    }

    // 1) Insert into credits_ledger
    const ledgerRow = {
      ambassador_id,
      type,
      amount,
      count: count || null,
      description: description || null,
      staff_id: staff_id || null,
      multiplier: multiplier || 1,
      created_at: new Date().toISOString()
    };

    const ledgerRes = await fetch(SUPABASE_URL + '/rest/v1/credits_ledger', {
      method: 'POST',
      headers,
      body: JSON.stringify(ledgerRow)
    });

    if (!ledgerRes.ok) {
      const err = await ledgerRes.text();
      console.error('Ledger insert failed:', err);
      return res.status(500).json({ error: 'DB insert failed', detail: err });
    }

    // 2) Update ambassador profile totals
    const profRes = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?id=eq.' + ambassador_id + '&select=total_credits,monthly_credits,monthly_guests',
      { headers }
    );
    const profiles = await profRes.json();
    if (profiles && profiles.length > 0) {
      const p = profiles[0];
      const updateFields = {
        total_credits: (p.total_credits || 0) + amount,
        monthly_credits: (p.monthly_credits || 0) + amount
      };
      if (type === 'door_guests' && count) {
        updateFields.monthly_guests = (p.monthly_guests || 0) + count;
      }
      await fetch(
        SUPABASE_URL + '/rest/v1/profiles?id=eq.' + ambassador_id,
        { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(updateFields) }
      );
    }

    return res.status(200).json({ ok: true, amount });

  } catch (err) {
    console.error('register-credits error:', err);
    return res.status(500).json({ error: err.message });
  }
}

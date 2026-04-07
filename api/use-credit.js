// api/use-credit.js — Use time credits or regular credits (service_role, bypasses RLS)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profile_id, amount } = req.body || {};
  if (!profile_id || !amount || amount < 1) {
    return res.status(400).json({ error: 'profile_id and amount required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Load time credits (earliest expiry first)
  const { data: timeCredits } = await sb.from('time_credits')
    .select('id, remaining, campaign_name')
    .eq('ambassador_id', profile_id)
    .gt('remaining', 0)
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });

  // Load regular credits
  const { data: profile } = await sb.from('profiles')
    .select('credits')
    .eq('id', profile_id)
    .single();

  const totalTimeCredits = (timeCredits || []).reduce((s, tc) => s + tc.remaining, 0);
  const regularCredits = Math.floor(profile?.credits || 0);
  const totalAvailable = totalTimeCredits + regularCredits;

  if (amount > totalAvailable) {
    return res.status(400).json({
      error: 'Ikke nok credits',
      available: totalAvailable,
      timeCredits: totalTimeCredits,
      regularCredits
    });
  }

  let remaining = amount;
  let tcUsed = 0;
  const tcDetails = [];

  // Use time credits first
  for (const tc of (timeCredits || [])) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, tc.remaining);
    const { error } = await sb.from('time_credits')
      .update({ remaining: tc.remaining - take })
      .eq('id', tc.id);
    if (error) {
      return res.status(500).json({ error: 'Time credit update failed: ' + error.message });
    }
    remaining -= take;
    tcUsed += take;
    tcDetails.push({ name: tc.campaign_name, used: take });
  }

  // Use regular credits for the rest
  let regUsed = 0;
  if (remaining > 0) {
    regUsed = remaining;
    const newCredits = regularCredits - regUsed;
    const { error } = await sb.from('profiles')
      .update({ credits: newCredits })
      .eq('id', profile_id);
    if (error) {
      return res.status(500).json({ error: 'Profile credit update failed: ' + error.message });
    }
  }

  return res.status(200).json({
    ok: true,
    used: amount,
    tcUsed,
    regUsed,
    tcDetails,
    remainingTimeCredits: totalTimeCredits - tcUsed,
    remainingRegularCredits: regularCredits - regUsed
  });
};

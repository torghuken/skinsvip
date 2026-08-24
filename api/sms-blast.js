// api/sms-blast.js — Super admin: SMS blast to filtered users
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, message, role_filter, active_only, user_ids } = req.body || {};
  if (!['preview', 'send', 'history'].includes(action)) return res.status(400).json({ error: 'Ugyldig action' });

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

  if (action === 'history') {
    const { data, error } = await sb.from('sms_blasts')
      .select('id, message, role_filter, active_only, recipients_count, succeeded_count, failed_count, created_at, sent_by, profiles:sent_by(full_name)')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, history: data || [] });
  }

  let recipients, qErr;
  const useUserIds = Array.isArray(user_ids) && user_ids.length > 0;
  const roles = Array.isArray(role_filter) && role_filter.length ? role_filter : ['vip'];

  if (useUserIds) {
    ({ data: recipients, error: qErr } = await sb.from('profiles').select('id, full_name, phone').in('id', user_ids).not('phone', 'is', null));
  } else {
    let query = sb.from('profiles').select('id, full_name, phone').in('role', roles).not('phone', 'is', null);
    if (active_only) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('updated_at', cutoff);
    }
    ({ data: recipients, error: qErr } = await query);
  }

  if (qErr) return res.status(500).json({ error: qErr.message });

  const validRecipients = (recipients || []).filter(r => r.phone && r.phone.trim().length >= 6);

  if (action === 'preview') {
    return res.status(200).json({ ok: true, count: validRecipients.length });
  }

  if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Melding mangler' });
  if (validRecipients.length === 0) return res.status(400).json({ error: 'Ingen mottakere' });

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN_TW = process.env.TWILIO_AUTH_TOKEN;
  const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const FROM = process.env.TWILIO_FROM_NUMBER;

  if (!SID || !TOKEN_TW || (!MSID && !FROM)) {
    return res.status(500).json({ error: 'Twilio ikke konfigurert' });
  }

  const twilioAuth = 'Basic ' + Buffer.from(SID + ':' + TOKEN_TW).toString('base64');

  const sendOne = async (r) => {
    const to = r.phone.startsWith('+') ? r.phone.replace(/\s/g, '') : '+47' + r.phone.replace(/[^0-9]/g, '');
    const params = { To: to, Body: message };
    if (MSID) params.MessagingServiceSid = MSID;
    else params.From = FROM;
    try {
      const smsRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
        method: 'POST',
        headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString()
      });
      return smsRes.ok;
    } catch (e) {
      return false;
    }
  };

  const results = await Promise.allSettled(validRecipients.map(sendOne));
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const failed = validRecipients.length - succeeded;

  await sb.from('sms_blasts').insert({
    sent_by: callerId,
    message,
    role_filter: useUserIds ? ['custom'] : roles,
    active_only: !!active_only,
    recipients_count: validRecipients.length,
    succeeded_count: succeeded,
    failed_count: failed
  });

  return res.status(200).json({ ok: true, sent: succeeded, failed, total: validRecipients.length });
};

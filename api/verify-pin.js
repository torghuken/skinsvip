// api/verify-pin.js — Server-side PIN verification with IP rate limiting
// Codes never exposed to client. Max 5 attempts per IP per 15 min.
const { createClient } = require('@supabase/supabase-js');

const attempts = new Map(); // IP -> { count, firstAttempt, lockedUntil }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOCKOUT_MS = 5 * 60 * 1000; // 5 min lockout after max attempts

// Cleanup old entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of attempts) {
    if (now - data.firstAttempt > WINDOW_MS && now > (data.lockedUntil || 0)) {
      attempts.delete(ip);
    }
  }
}, 30 * 60 * 1000);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();
  let record = attempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  // Reset window if expired
  if (now - record.firstAttempt > WINDOW_MS && now > record.lockedUntil) {
    record = { count: 0, firstAttempt: now, lockedUntil: 0 };
  }

  // Check lockout
  if (record.lockedUntil > now) {
    const retry = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({ ok: false, error: 'rate_limited', retry_after: retry });
  }

  const { pin } = req.body || {};
  if (!pin || typeof pin !== 'string' || pin.length !== 4) {
    return res.status(400).json({ ok: false, error: 'Invalid pin format' });
  }

  // Fetch venue codes from database
  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzbHB3eHpyY3ZvYnllY2N3b2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjgzMDgsImV4cCI6MjA5MDIwNDMwOH0.4JWT-rs_C6jvldiKNSCkhxAQYuhGa00teIviIw--cmI'
  );

  const { data: vc } = await sb.from('venue_settings').select('door_code,bar_code,manager_code').limit(1).maybeSingle();
  if (!vc) return res.status(500).json({ ok: false, error: 'Could not load codes' });

  const roles = [
    { key: 'door_code',    label: 'Dørvakt' },
    { key: 'bar_code',     label: 'Bartender' },
    { key: 'manager_code', label: 'Manager' },
  ];

  const match = roles.find(r => vc[r.key] && vc[r.key] !== 'DISABLED' && vc[r.key] === pin);

  if (!match) {
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
    }
    attempts.set(ip, record);

    // Add artificial delay (100ms per attempt) to slow brute force
    await new Promise(resolve => setTimeout(resolve, record.count * 100));

    return res.status(200).json({ ok: false, error: 'wrong_pin', attempts_left: Math.max(0, MAX_ATTEMPTS - record.count) });
  }

  // Success — reset this IP
  attempts.delete(ip);
  return res.status(200).json({ ok: true, role: match.label });
};

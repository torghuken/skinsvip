// api/vip-book-table.js — Premium VIP: book table for Friday/Saturday
const { createClient } = require('@supabase/supabase-js');

function nextDay(targetDay) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const dateStr = parts.filter(p => ['year','month','day'].includes(p.type)).map(p => p.value).join('-');
  const wd = parts.find(p => p.type === 'weekday').value;
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDay = wdMap[wd];
  const daysUntil = (targetDay - currentDay + 7) % 7;
  const d = new Date(dateStr + 'T20:00:00+02:00');
  d.setDate(d.getDate() + daysUntil);
  return d;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { day, guests, arrival_time, note } = req.body || {};
  if (!['friday', 'saturday'].includes(day)) return res.status(400).json({ error: 'Ugyldig dag' });
  const guestCount = parseInt(guests);
  if (!guestCount || guestCount < 1 || guestCount > 12) return res.status(400).json({ error: 'Ugyldig antall gjester' });
  if (!arrival_time) return res.status(400).json({ error: 'Ankomsttid mangler' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Mangler auth-token' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Ugyldig session' });
  const callerId = userData.user.id;

  const { data: caller } = await sb.from('profiles').select('id, full_name, role, vip_level').eq('id', callerId).single();
  if (!caller || caller.role !== 'vip') return res.status(403).json({ error: 'Kun VIP kan booke bord' });
  if ((caller.vip_level || 1) < 3) return res.status(403).json({ error: 'Krever VIP Premium' });

  const eventDate = nextDay(day === 'friday' ? 5 : 6);
  const noteFull = 'Ankomst kl ' + arrival_time + (note ? '. ' + note : '');

  const { data: booking, error: insErr } = await sb.from('bookings').insert({
    ambassador_id: callerId,
    event_name: 'VIP bord-booking',
    event_type: 'table',
    event_date: eventDate.toISOString(),
    guest_count: guestCount,
    notes: noteFull,
    status: 'pending'
  }).select().single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  try {
    await fetch((process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://skinsvip.no') + '/api/sms-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'VIP bord-booking',
        event_date: eventDate.toISOString(),
        guest_count: guestCount,
        ambassador_name: caller.full_name + ' (Premium VIP)',
        table_type: 'vip',
        notes: noteFull,
        booking_id: booking.id
      })
    });
  } catch (e) {
    // Booking is saved; SMS failure is non-fatal
    console.error('SMS notify failed:', e.message);
  }

  return res.status(200).json({ ok: true, booking_id: booking.id });
};

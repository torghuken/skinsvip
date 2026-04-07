// api/cron-streak.js — Runs Sunday morning, updates booking streaks
// Checks who had bookings on Friday/Saturday, adjusts streaks accordingly
// Streak +1 per day with booking, -1 per day without (min 0, max 3)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // Verify cron secret
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get last Friday and Saturday dates
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const lastSaturday = new Date(now);
  lastSaturday.setDate(now.getDate() - (dayOfWeek === 0 ? 1 : dayOfWeek + 1 - 6));
  lastSaturday.setHours(0, 0, 0, 0);

  const lastFriday = new Date(lastSaturday);
  lastFriday.setDate(lastSaturday.getDate() - 1);

  const sundayEnd = new Date(lastSaturday);
  sundayEnd.setDate(lastSaturday.getDate() + 1);
  sundayEnd.setHours(6, 0, 0, 0); // Saturday night ends at 06:00 Sunday

  const fridayStr = lastFriday.toISOString();
  const saturdayStr = lastSaturday.toISOString();
  const sundayEndStr = sundayEnd.toISOString();

  // Get all ambassadors
  const { data: ambassadors } = await sb.from('profiles')
    .select('id, booking_streak')
    .eq('role', 'ambassador');

  if (!ambassadors || !ambassadors.length) {
    return res.status(200).json({ ok: true, message: 'No ambassadors found' });
  }

  // Get all bookings from Friday and Saturday
  // Friday: from Friday 00:00 to Saturday 06:00
  // Saturday: from Saturday 00:00 to Sunday 06:00
  const fridayEnd = new Date(lastSaturday);
  fridayEnd.setHours(6, 0, 0, 0);

  const { data: fridayBookings } = await sb.from('bookings')
    .select('ambassador_id')
    .gte('created_at', fridayStr)
    .lt('created_at', fridayEnd.toISOString());

  const { data: saturdayBookings } = await sb.from('bookings')
    .select('ambassador_id')
    .gte('created_at', saturdayStr)
    .lt('created_at', sundayEndStr);

  const fridaySet = new Set((fridayBookings || []).map(b => b.ambassador_id));
  const saturdaySet = new Set((saturdayBookings || []).map(b => b.ambassador_id));

  let updated = 0;
  for (const amb of ambassadors) {
    let streak = amb.booking_streak || 0;
    const hadFriday = fridaySet.has(amb.id);
    const hadSaturday = saturdaySet.has(amb.id);

    // +1 for each day with booking, -1 for each day without
    if (hadFriday) streak++; else streak--;
    if (hadSaturday) streak++; else streak--;

    // Clamp between 0 and 3
    streak = Math.max(0, Math.min(3, streak));

    if (streak !== (amb.booking_streak || 0)) {
      await sb.from('profiles').update({ booking_streak: streak }).eq('id', amb.id);
      updated++;
    }
  }

  return res.status(200).json({ ok: true, updated, ambassadors: ambassadors.length });
};

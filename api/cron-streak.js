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
    process.env.SUPABASE_SERVICE_KEY
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
    .select('id, booking_streak, total_points, monthly_spend')
    .eq('role', 'ambassador');

  if (!ambassadors || !ambassadors.length) {
    return res.status(200).json({ ok: true, message: 'No ambassadors found' });
  }

  // Get all guest_registrations from Friday and Saturday (ambassador activity)
  const fridayEnd = new Date(lastSaturday);
  fridayEnd.setHours(6, 0, 0, 0);

  const { data: frAmbGuests } = await sb.from('guest_registrations')
    .select('ambassador_id')
    .gte('registered_at', fridayStr)
    .lt('registered_at', fridayEnd.toISOString());

  const { data: saAmbGuests } = await sb.from('guest_registrations')
    .select('ambassador_id')
    .gte('registered_at', saturdayStr)
    .lt('registered_at', sundayEndStr);

  const frAmbSet = new Set((frAmbGuests || []).map(g => g.ambassador_id));
  const saAmbSet = new Set((saAmbGuests || []).map(g => g.ambassador_id));

  let updated = 0;
  for (const amb of ambassadors) {
    const bothDays = frAmbSet.has(amb.id) && saAmbSet.has(amb.id);
    let streak = amb.booking_streak || 0;

    if (bothDays) {
      streak = Math.min(streak + 1, 4);
    } else {
      streak = 0;
    }

    if (streak !== (amb.booking_streak || 0)) {
      const bonus = streak * 100; // 100/200/300/400
      const update = { booking_streak: streak };
      if (bothDays && bonus > 0) {
        update.total_points = (amb.total_points || 0) + bonus;
        update.monthly_spend = (amb.monthly_spend || 0) + bonus;
      }
      await sb.from('profiles').update(update).eq('id', amb.id);
      updated++;
    }
  }

  // ── VIP Visit Streaks ──
  // Visit = checked in (guest_registration) during fri/sat
  // Streak: 1→2→3→4 (max 4), resets to 0 on miss
  // Bonus points awarded: streak × 100 (100/200/300/400)
  const { data: vips } = await sb.from('profiles')
    .select('id, visit_streak, total_points, monthly_spend')
    .eq('role', 'vip');

  let vipUpdated = 0;
  if (vips && vips.length) {
    // Check guest_registrations for visits (VIP checked in)
    const { data: frGuests } = await sb.from('guest_registrations')
      .select('ambassador_id')
      .gte('registered_at', fridayStr)
      .lt('registered_at', fridayEnd.toISOString());

    const { data: saGuests } = await sb.from('guest_registrations')
      .select('ambassador_id')
      .gte('registered_at', saturdayStr)
      .lt('registered_at', sundayEndStr);

    const frSet = new Set((frGuests || []).map(g => g.ambassador_id));
    const saSet = new Set((saGuests || []).map(g => g.ambassador_id));

    for (const vip of vips) {
      const bothDays = frSet.has(vip.id) && saSet.has(vip.id);
      let streak = vip.visit_streak || 0;

      if (bothDays) {
        streak = Math.min(streak + 1, 4);
      } else {
        streak = 0;
      }

      if (streak !== (vip.visit_streak || 0)) {
        const bonus = streak * 100; // 100/200/300/400
        const update = { visit_streak: streak };
        if (visited && bonus > 0) {
          update.total_points = (vip.total_points || 0) + bonus;
          update.monthly_spend = (vip.monthly_spend || 0) + bonus;
        }
        await sb.from('profiles').update(update).eq('id', vip.id);
        vipUpdated++;
      }
    }
  }

  return res.status(200).json({ ok: true, updated, ambassadors: ambassadors.length, vipUpdated, vips: vips?.length || 0 });
};

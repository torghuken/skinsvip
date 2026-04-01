// api/booking-action.js – Godkjenn eller avvis booking via SMS-lenke
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  const { token, action } = req.query;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!token || !['godkjenn','avvis'].includes(action))
    return res.status(400).send(page('Ugyldig lenke', 'Lenken er ikke gyldig.', false, null));

  const SB  = 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const h   = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  const rows = await (await fetch(SB + '/rest/v1/bookings?approval_token=eq.' + token + '&select=*', { headers: h })).json();
  if (!rows || !rows.length)
    return res.status(404).send(page('Ikke funnet', 'Bookingen ble ikke funnet eller lenken er utlopt.', false, null));

  const b = rows[0];
  if (b.status === 'approved' || b.status === 'rejected')
    return res.status(200).send(page('Allerede behandlet', 'Bookingen er allerede ' + (b.status === 'approved' ? 'godkjent' : 'avvist') + '.', b.status === 'approved', b));

  const newStatus = action === 'godkjenn' ? 'approved' : 'rejected';
  const update = { status: newStatus };

  // Ensure booking_token exists for QR check-in
  if (newStatus === 'approved' && !b.booking_token) {
    update.booking_token = crypto.randomUUID();
  }

  await fetch(SB + '/rest/v1/bookings?id=eq.' + b.id, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify(update)
  });

  // Send QR check-in SMS to guest if phone number exists
  const ok = action === 'godkjenn';
  let guestSmsStatus = 'no_phone';
  if (ok && b.guest_phone) {
    const SID   = process.env.TWILIO_ACCOUNT_SID;
    const TOKEN_TW = process.env.TWILIO_AUTH_TOKEN;
    const FROM  = process.env.TWILIO_FROM_NUMBER;
    if (!SID || !TOKEN_TW || !FROM) {
      guestSmsStatus = 'twilio_not_configured';
    } else {
      const checkinUrl = BASE + '/checkin.html?token=' + (b.booking_token || update.booking_token) + '&role=guest';
      const dateStr = b.event_date ? b.event_date.split('T')[0] : '';
      const smsBody = [
        'SKINS NightClub - Din booking er bekreftet!',
        '',
        b.event_name || 'Arrangement',
        dateStr ? 'Dato: ' + dateStr : null,
        b.guest_count ? 'Gjester: ' + b.guest_count : null,
        '',
        'Vis denne lenken i doera:',
        checkinUrl
      ].filter(l => l !== null).join('\n');

      const guestPhone = b.guest_phone.startsWith('+') ? b.guest_phone : '+47' + b.guest_phone.replace(/\s/g, '');
      try {
        const smsRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(SID + ':' + TOKEN_TW).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ To: guestPhone, From: FROM, Body: smsBody }).toString()
        });
        const smsData = await smsRes.json();
        guestSmsStatus = smsRes.ok ? 'sent:' + smsData.sid : 'error:' + (smsData.message || smsData.code);
      } catch (e) {
        guestSmsStatus = 'exception:' + e.message;
      }
    }
  }

  const guestMsg = guestSmsStatus.startsWith('sent') ? ' QR-kode sendt til gjesten på SMS.'
    : guestSmsStatus === 'no_phone' ? '' : ' (Gjeste-SMS feilet: ' + guestSmsStatus + ')';

  return res.status(200).send(page(
    ok ? 'Booking godkjent!' : 'Booking avvist',
    ok ? 'Bookingen for ' + (b.event_name||'arrangement') + ' er godkjent.' + guestMsg
       : 'Bookingen for ' + (b.event_name||'arrangement') + ' er avvist.',
    ok, b
  ));
}

function page(title, msg, ok, b) {
  const c   = ok ? '#27ae60' : '#e74c3c';
  const ico = ok ? '&#10003;' : '&#10007;';
  const det = b ? '<div class="d"><p><s>Arrangement</s><strong>' + (b.event_name||'-') + '</strong></p>'
    + '<p><s>Dato</s><strong>'    + (b.event_date||'-') + '</strong></p>'
    + '<p><s>Gjester</s><strong>' + (b.guest_count||'-') + '</strong></p></div>' : '';
  return '<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + ' - SKINS</title><style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:-apple-system,sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}'
    + '.card{background:#1a1a1a;border:2px solid ' + c + ';border-radius:20px;padding:36px 28px;max-width:400px;width:100%;text-align:center}'
    + '.ico{width:70px;height:70px;border-radius:50%;border:2px solid ' + c + ';display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:30px;color:' + c + '}'
    + 'h1{font-size:21px;color:' + c + ';margin-bottom:10px}'
    + 'p.m{color:#999;line-height:1.6;margin-bottom:18px}'
    + '.d{background:#222;border-radius:10px;padding:14px;text-align:left}'
    + '.d p{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #333;font-size:13px}'
    + '.d p:last-child{border:none}.d s{color:#888;text-decoration:none}.d strong{color:#C9A84C}'
    + '.logo{margin-top:22px;color:#C9A84C;font-size:10px;letter-spacing:3px}'
    + '</style></head><body><div class="card">'
    + '<div class="ico">' + ico + '</div>'
    + '<h1>' + title + '</h1><p class="m">' + msg + '</p>' + det
    + '<p class="logo">SKINS NIGHTCLUB</p></div></body></html>';
}

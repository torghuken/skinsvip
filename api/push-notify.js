// api/push-notify.js
import crypto from 'crypto';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function makeVapidJwt(audience, subject, privB64) {
  const hdr = b64url(JSON.stringify({typ:'JWT',alg:'ES256'}));
  const now = Math.floor(Date.now()/1000);
  const pay = b64url(JSON.stringify({aud:audience,exp:now+3600,sub:subject}));
  const toSign = hdr+'.'+pay;
  const privRaw = Buffer.from(privB64.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
  const pkcs8 = Buffer.concat([
    Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420','hex'),
    privRaw
  ]);
  const key = crypto.createPrivateKey({key:pkcs8,format:'der',type:'pkcs8'});
  const sig = crypto.sign('sha256', Buffer.from(toSign), {key,dsaEncoding:'ieee-p1363'});
  return toSign+'.'+b64url(sig);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const SB_URL   = process.env.SUPABASE_URL || 'https://hslpwxzrcvobyeccwoao.supabase.co';
  const SK       = process.env.SUPABASE_SERVICE_KEY;
  const VAPID_PUB  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUB  = process.env.VAPID_SUBJECT || 'mailto:hrtorghuken@gmail.com';

  if (!VAPID_PUB||!VAPID_PRIV) return res.status(200).json({ok:true,skipped:true,reason:'VAPID not configured'});

  try {
    const { title, body, url } = req.body || {};
    const r = await fetch(SB_URL+'/rest/v1/push_subscriptions?role=eq.manager&select=endpoint,p256dh,auth',
      { headers:{ apikey:SK, Authorization:'Bearer '+SK } });
    const subs = await r.json();
    if (!subs?.length) return res.status(200).json({ok:true,sent:0});

    const payload = JSON.stringify({ title: title||'SKINS NightClub', body: body||'Ny hendelse', url: url||'https://skinsvip.vercel.app' });

    const results = await Promise.allSettled(subs.map(async sub => {
      const u = new URL(sub.endpoint);
      const jwt = await makeVapidJwt(u.protocol+'//'+u.host, VAPID_SUB, VAPID_PRIV);
      const rr = await fetch(sub.endpoint, {
        method:'POST',
        headers:{ Authorization:'vapid t='+jwt+',k='+VAPID_PUB, 'Content-Type':'application/json', TTL:'86400' },
        body: payload
      });
      if (rr.status===410) {
        await fetch(SB_URL+'/rest/v1/push_subscriptions?endpoint=eq.'+encodeURIComponent(sub.endpoint),
          {method:'DELETE',headers:{apikey:SK,Authorization:'Bearer '+SK}});
      }
      return { status: rr.status };
    }));

    return res.status(200).json({ ok:true, sent:subs.length, results: results.map(r=>r.value||r.reason?.message) });
  } catch(err) { return res.status(500).json({error:err.message}); }
}
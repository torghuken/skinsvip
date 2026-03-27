# 🎉 SKINS VIP Ambassador Portal – Oppsettguide

## Oversikt over filer
- `index.html` – Innlogging og registrering
- `dashboard.html` – Ambassador-dashbord
- `bookings.html` – Booking og reservasjoner
- `leaderboard.html` – Poengrangering
- `activity.html` – Logg aktivitet
- `admin.html` – Admin-panel for daglig leder
- `supabase-setup.sql` – Database-oppsett
- `vercel.json` – Hosting-konfigurasjon

---

## Steg 1: Sett opp Supabase

1. Gå til [supabase.com](https://supabase.com) og logg inn
2. Opprett et nytt prosjekt kalt "skinsvip"
3. Gå til **SQL Editor** i venstremenyen
4. Kopier hele innholdet fra `supabase-setup.sql` og kjør det
5. Gå til **Project Settings → API**
6. Kopier:
   - **Project URL** (ser slik ut: `https://xxxxxx.supabase.co`)
   - **anon public** nøkkelen

---

## Steg 2: Legg inn Supabase-nøkler

Åpne ALLE disse filene og erstatt disse to linjene:
```
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

Med dine egne verdier fra Supabase.

Filer som trenger oppdatering:
- index.html
- dashboard.html
- bookings.html
- leaderboard.html
- activity.html
- admin.html

---

## Steg 3: Legg til logoen

1. Kopier logofilen din (f.eks. `skins-logo.png`) inn i skinsvip-app mappen
2. Åpne hver HTML-fil og finn kommentaren `<!-- LOGO PLACEHOLDER -->`
3. Erstatt med: `<img src="skins-logo.png" style="height:40px; filter: brightness(0) saturate(100%) invert(75%) sepia(50%) saturate(500%) hue-rotate(10deg);" alt="SKINS" />`

---

## Steg 4: Publiser på Vercel

1. Gå til [vercel.com](https://vercel.com) og opprett konto med GitHub
2. Opprett et nytt GitHub-repository (gratis på [github.com](https://github.com))
3. Last opp alle filene fra `skinsvip-app` mappen
4. I Vercel, klikk "Add New Project" og velg ditt GitHub-repo
5. Klikk "Deploy" – nettsiden er live!

---

## Steg 5: Koble skinsvip.no til Vercel

1. I Vercel: Gå til prosjektet → **Settings → Domains**
2. Legg til `skinsvip.no`
3. Vercel gir deg to DNS-verdier (A-record og CNAME)
4. Gå til [domene.no](https://domene.no) → Logg inn → Mine domener → skinsvip.no → DNS-innstillinger
5. Legg inn verdiene fra Vercel
6. Vent 5–30 minutter – da er skinsvip.no live! 🎉

---

## Steg 6: Sett opp admin-bruker

1. Gå til skinsvip.no og registrer deg som vanlig
2. Gå til Supabase → **SQL Editor** og kjør:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'din-epost@her.no';
   ```
3. Logg ut og logg inn igjen – da kommer du til admin-panelet

---

## Poengssystem
| Aktivitet | Poeng |
|-----------|-------|
| 1 gjest rekruttert | 10 pts |
| 100 kr i forbruk | 1 pt |
| 1 VIP-gjest | 50 pts |
| Godkjent booking (per gjest) | 5 pts |

## Nivåer
| Nivå | Poeng |
|------|-------|
| 🥉 Bronze | 0–499 |
| 🥈 Silver | 500–1499 |
| 🥇 Gold | 1500–2999 |
| 💎 Platinum | 3000–5999 |
| 👑 Diamond | 6000+ |

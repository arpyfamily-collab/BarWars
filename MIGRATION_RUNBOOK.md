# BarWars Migration Runbook
## Retiring Emergent (FastAPI/MongoDB/Expo) → Next.js / Supabase

---

## What we're keeping from Emergent

| Asset | Source | Destination |
|---|---|---|
| 3 Oxford Square bars | SEED_BARS in server.py | venues table (migration 006) |
| Bar coordinates | server.py lat/lon | venues.lat / venues.lon |
| Bar descriptions + ratings | server.py | venues.description / venues.rating |
| Promo event types | event_type enum | promo_types table |
| Age verification flag | user.age_verified | profiles.age_verified |
| Location opt-in concept | user.location_permission | profiles.location_opt_in |
| Haversine distance logic | haversine_miles() | rewritten in demand-score edge fn |
| Oxford center coords | OXFORD_CENTER | hardcoded in demand-score fn |
| Twilio OTP flow | sms.py | existing Twilio setup in our stack |
| Loyalty point concept | loyalty_points | ambassador.credit_balance_cents |

## What we're NOT keeping

- MongoDB data (no user migration — Auth is incompatible)
- FastAPI server (replaced by Next.js API routes)
- Expo frontend (replaced by Next.js PWA)
- Motor/PyMongo (replaced by Supabase client)
- JWT/bcrypt auth (replaced by Supabase Auth)
- The Emergent GitHub repo stays as an archive — don't delete it

---

## Step-by-step

### 1. Run all migrations in order

```bash
cd barwars
supabase db push
# Runs migrations 001 through 006 in sequence
# Migration 006 seeds the three Oxford bars
```

Verify bars landed:
```sql
select name, slug, lat, lon, rating from venues order by name;
-- Should return: Funky's, Rooster's, The Library
```

### 2. Re-create Emergent's seed users in Supabase Auth

Emergent's password hashes are bcrypt via passlib — not importable into Supabase Auth.
Create them fresh via the Supabase dashboard or CLI:

```bash
# CLI method (requires supabase CLI logged in)
supabase auth admin create-user \
  --email admin@olemiss.app \
  --password "Admin123!" \
  --email-confirm

supabase auth admin create-user \
  --email student@olemiss.app \
  --password "Student123!" \
  --email-confirm
```

Then grab their UUIDs from the Auth dashboard and run:

```sql
-- Make admin a bar admin of The Library
insert into bar_admins (user_id, bar_id)
select '<ADMIN_UUID>', id from venues where slug = 'the-library';

-- Give admin staff flag too (for scanner access)
update profiles set is_staff = true where id = '<ADMIN_UUID>';

-- Seed student's loyalty → ambassador credit ($0.75 from 75 Emergent points)
insert into ambassadors (user_id, credit_balance_cents)
values ('<STUDENT_UUID>', 75)
on conflict (user_id) do update set credit_balance_cents = 75;
```

### 3. Deploy edge functions

```bash
supabase functions deploy process-score-event
supabase functions deploy challenge-notifications
supabase functions deploy declare-winner
supabase functions deploy mystery-drop
supabase functions deploy demand-score
```

Set secrets in Supabase dashboard → Edge Functions → Secrets:
```
SCORE_EVENT_SECRET=<generate: openssl rand -hex 32>
FCM_SERVER_KEY=<from Firebase console>
TWILIO_ACCOUNT_SID=<from Emergent's backend/.env>
TWILIO_AUTH_TOKEN=<from Emergent's backend/.env>
TWILIO_FROM_NUMBER=<from Emergent's backend/.env>
CFBD_API_KEY=<from collegefootballdata.com>
INTERNAL_API_KEY=<generate: openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://barwars.app
```

Note: Twilio credentials can be copied directly from Emergent's
`backend/.env` file — same account, no re-setup needed.

### 4. Set up Stripe

1. Create a product in Stripe dashboard: "Library Card"
2. Add a recurring price: $49.99/month
3. Copy the Price ID → `STRIPE_LIBRARY_CARD_PRICE_ID`
4. Add webhook endpoint: `https://barwars.app/api/stripe/webhook`
   Events: `checkout.session.completed`, `invoice.payment_succeeded`,
           `customer.subscription.deleted`
5. Copy webhook secret → `STRIPE_WEBHOOK_SECRET`

### 5. Set up Firebase (for push notifications)

1. Create project at console.firebase.google.com
2. Add a Web app
3. Enable Cloud Messaging
4. Copy config values → `.env.local` (see .env.firebase.example)
5. Generate VAPID key in Cloud Messaging settings
6. Copy FCM Server Key → Supabase secret `FCM_SERVER_KEY`

### 6. Deploy Next.js to Vercel

```bash
cd barwars
vercel deploy --prod
```

Set all env vars in Vercel dashboard (copy from .env.local).

### 7. Seed tonight's events for testing

Use the operator dashboard at `/operator` to:
1. Create an event for The Library (tonight's date)
2. Set pricing tiers
3. Create a time window or two
4. Trigger the demand-score fetch for tonight's date

Or insert directly:
```sql
insert into events (
  venue_id, name, date, night_tier,
  full_venue_price, music_hall_price, bull_patio_price, sports_lounge_price,
  full_venue_capacity, music_hall_capacity, bull_patio_capacity, sports_lounge_capacity
)
select
  id, 'Friday Night', current_date, 'standard',
  6000, 3500, 3500, 3500,   -- prices in cents
  300, 120, 100, 80
from venues where slug = 'the-library';
```

### 8. Smoke test

```bash
# Wristband purchase
curl -X POST https://barwars.app/api/stripe/create-checkout \
  -H "Authorization: Bearer <patron-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"<event-uuid>","passType":"full_venue"}'

# Demand score
curl -X POST https://barwars.app/api/demand/analyze \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"<library-uuid>","date":"2026-09-06"}'

# Ambassador enrollment
curl -X POST https://barwars.app/api/ambassador/register \
  -H "Authorization: Bearer <patron-jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 9. Archive Emergent repo

Tag the Emergent repo before stopping it:
```bash
cd /path/to/emergent-barwars
git tag v0-emergent-archive
git push origin v0-emergent-archive
```

Shut down the FastAPI server and MongoDB instance.
The Expo app can be left as-is (no active users yet).

---

## Feature parity checklist

| Emergent feature | BarWars equivalent | Status |
|---|---|---|
| Promo feed (trivia, happy hour, music) | Fire sales + events on home screen | ✅ Built |
| QR generation | Pass QR codes | ✅ Built |
| QR redemption | Door scanner (camera) | ✅ Built |
| Loyalty points | Ambassador credit balance | ✅ Built |
| Age verification gate | profiles.age_verified + pass purchase gate | ✅ Schema done, needs middleware |
| Location opt-in | profiles.location_opt_in | ✅ Schema done |
| Push/SMS prefs | user_push_tokens + Twilio | ✅ Built |
| Bar directory | Venues on home screen | ✅ Built |
| Admin analytics | Operator dashboard | ✅ Built |
| Admin promo create | Operator event creation | 🔲 UI not yet built |
| Phone OTP verification | Supabase Phone Auth | 🔲 Wire in |
| Privacy export/delete | 🔲 Add to account page | 🔲 Not yet built |

---

## Twilio note

Emergent's `sms.py` uses the Twilio Python SDK.
BarWars uses Twilio's REST API directly in Deno edge functions (already built).
Same account and credentials — just a different client library.
Copy SID, auth token, and from-number directly from Emergent's `backend/.env`.

---

## What's better in the new stack

- Real-time: Supabase channels replace polling
- Capacity enforcement: `reserve_pass()` RPC with row-level lock (MongoDB has no equivalent)
- Stripe: full payment processing (Emergent had zero payment capability)
- Bar vs. Bar challenges: not possible in Emergent's architecture
- Demand algorithm: CFBD API integration
- Ambassador tiers: referral attribution via Stripe webhook
- Mystery drops: virtual queue with randomized access (not speed-based)
- PWA: no app store, instant updates

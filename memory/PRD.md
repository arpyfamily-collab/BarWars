# PRD — Consent-first Proximity Promos for Ole Miss

## Goal
Consent-based, proximity-driven nightlife promo platform for bars near the University of Mississippi (Oxford, MS). User opt-in, QR redemption, loyalty, and a bar-admin promo + analytics console.

## Users
- **Student / Member** — discovers nearby promos, generates per-promo QR, earns loyalty.
- **Bar Admin** — creates promos, views analytics across bars.

## Stack
- Backend: FastAPI + Motor (MongoDB) — JWT auth (bcrypt+jose).
- Frontend: Expo Router (React Native) — SecureStore on native / AsyncStorage on web.
- Design: "Glass / Luxe DARK" with Ole Miss navy (#0A111F/#14213D) + red (#CE1126).

## Key Screens
1. Onboarding (location + 21+ consent toggles, hero bg + scrim).
2. Sign in / Sign up (JWT).
3. Promo Feed — sticky chips (All / Trivia / Live Music / Happy Hour), distance-sorted, gradient-scrim image cards.
4. Bars directory — list with rating + distance.
5. Tickets / QR — loyalty card with progress (100pts threshold) + active ticket rows → modal QR (white pad, expiry countdown, staff redeem).
6. Promo Detail — hero + offers + age-gated CTA.
7. Profile — preferences (radius, push/SMS), privacy (age/location/opt-in), admin entries, sign-out.
8. Admin Create — bar picker, event type pills, hours/radius/max, sticky publish CTA.
9. Admin Analytics — KPI grid (redeems, views, saves, active, users, opt-in %) + promo performance list.

## API Surface (`/api/...`)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Users: `PATCH /users/me`, `POST /users/me/opt-in`, `GET /users/me/loyalty`, `POST /users/me/loyalty/redeem`
- Bars: `GET /bars`, `GET /bars/{id}`
- Promos: `GET /promos`, `GET /promos/{id}`, `POST /promos` (admin), `POST /promos/{id}/qr`
- QR: `GET /qrcodes/{code}`, `POST /qrcodes/{code}/redeem`
- Engagements: `POST /engagements`
- Admin: `GET /admin/analytics`, `GET /admin/promos`
- Privacy: `GET /privacy/me`, `POST /privacy/me/export`, `DELETE /privacy/me`

## Seeded Data
- Admin + 1 demo student.
- 3 bars: The Library Sports Bar, Funky's Pizza & Daiquiri Bar, Rooster's Blues House (Oxford Square coords).
- 4 active promos (trivia, daiquiri, live blues, game-day pitchers).

## Privacy / Compliance
- Age verification gates alcohol QR generation.
- Audit log written on register / login / promo create / qr redeem / loyalty redeem / user delete.
- Export (`/privacy/me/export`) returns user + engagements + qrcodes; `DELETE /privacy/me` purges user data (non-admin).

## SMS
SMS now uses the **real Twilio Messages API** (`twilio` Python SDK).
- Endpoints: `GET /api/sms/status`, `POST /api/sms/otp/send`, `POST /api/sms/otp/verify`, `POST /api/sms/test`
- OTP: 6-digit, 10-minute expiry, single-use, 1-send-per-60s rate limit (stored in `db.phone_otps`)
- User model adds `phone` (E.164) and `phone_verified` (bool)
- Sign-up flow now routes to `/verify-phone` before the tabs; user can skip
- Profile shows a "Send test SMS" button once `phone_verified=true`
- Credentials live in `/app/backend/.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — currently placeholders. The `/api/sms/status` endpoint reports `configured: false` and send endpoints return a clean `503` until real creds are pasted in.

## Location
Uses `expo-location` with foreground permission; **falls back to Oxford, MS center (34.365, -89.5384)** when permission denied or running in preview.

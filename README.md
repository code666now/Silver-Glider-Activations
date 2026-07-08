# Silver Glider Activations

Festival booth voting platform. Vendors register a booth, get a QR code, and festival
attendees scan and vote for their favorite. Built for Thrift Fest 2026.

This is a **standalone backend**, extracted from the Silver Glider Tickets repo. It runs
as its own service and does **not** depend on any ticketing code. It shares the same
PostgreSQL database (tables prefixed `sg_`), but its tables
(`sg_activations`, `sg_participants`, `sg_activation_votes`, `sg_activation_optins`)
have no foreign keys to the ticketing tables.

## Run locally

```bash
npm install
cp .env.example .env   # fill in the values
npm run dev            # or: npm start
```

The server creates/updates its tables on startup (idempotent migrations in
`src/migrations/`), then listens on `PORT` (default 3000).

Health check: `GET /health` → `{ "status": "ok", "sha": "..." }`

## Structure

```
src/
  index.js              App entry: migrations, static, routes, /health, /unsubscribe
  config/db.js          pg Pool (DATABASE_URL)
  middleware/
    auth.js             requireActivationsAdmin (JWT, own secret)
    errorHandler.js     global error handler
  routes/activations.js All routes + server-rendered pages (signup, landing, voting,
                        profile, winner, master QR, admin API)
  db/activationsDB.js   Data layer (SQL) + runtime column migrations
  lib/
    cloudinary.js       Booth photo uploads (env-only credentials)
    mailer.js           Resend emails: booth confirmation, admin notify, welcome
  migrations/
    001_activations.sql Full schema (CREATE TABLE IF NOT EXISTS ...)
  views/
    activations-login.html
    activations-admin.html
public/                 Backgrounds + logo (served at site root)
```

## Key routes

| Route | What |
|---|---|
| `GET /activations/:slug` | Voting landing page (leaderboard, cached 30s) |
| `GET /activations/:slug/join` · `POST` | Booth self-registration |
| `GET /activations/:slug/:booth` | Booth voting page |
| `POST /activations/:slug/:booth/vote` | Cast a vote (5 positive ballots/device) |
| `POST /activations/:slug/:booth/optin` | Email opt-in |
| `GET /activations/:slug/:booth/profile` | Vendor QR page (print) |
| `GET /activations/:slug/qr` | Master QR (entrance) |
| `GET /activations/:slug/winner` | Winner page |
| `GET /activations/admin/activations` | Admin panel (login at `/activations-login`) |
| `GET /health` · `GET /unsubscribe` | Ops |

## Voting rules

- 5 positive votes per device (fingerprint), enforced server-side.
- "Not My Vibe" is recorded for analytics but doesn't burn a ballot or count toward winning.
- One vote per booth per device — DB `UNIQUE` constraint, race-proof.
- Voting closes at `voting_ends_at` (checked every 60s) or via the admin button.

## Environment

See `.env.example`. All secrets come from env — no hardcoded credentials. Before the
event: set `RAILWAY_BASE_URL` to the final custom domain **before** any QR codes are
printed (the codes encode this URL).

## Deployment (Railway)

1. Point the Railway service at this repo.
2. Copy env vars (see `.env.example`); ensure `RESEND_API_KEY`, `RESEND_FROM`,
   `RAILWAY_BASE_URL`, `RAILWAY_PUBLIC_DOMAIN` are set.
3. Add custom domain, then set `RAILWAY_BASE_URL` / `RAILWAY_PUBLIC_DOMAIN` to it.
4. Hit `/health`; set instance RAM ≥ 1GB before event day.

## Notes for maintainers

- Admin auth uses `ACTIVATIONS_ADMIN_SECRET` — set a strong value; the built-in
  fallback is for local dev only.
- Cloudinary credentials must be provided via env (rotate the old shared keys that
  were previously hardcoded in the source).
- The weekly Friday "picks" email is **not** built yet — opt-ins are collected but no
  send mechanism exists.

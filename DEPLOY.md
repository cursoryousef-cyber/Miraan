# 🚀 Miran Platform — Render Deployment Guide

Guide for deploying the Miran Enterprise Backend API to [Render](https://render.com) using Neon PostgreSQL.

---

## 📋 One-Click Deployment Configuration

### 1. Build Command
```bash
cd backend && npm install && npx prisma generate && npm run build
```

### 2. Start Command
```bash
cd backend && npx prisma migrate deploy && node dist/src/main.js
```
Applies committed migrations only. The legacy demo seed (`src/seed/seed.ts`) is
**not** run automatically — see below.

### 3. Required Environment Variables
Configure these in Render Dashboard (**Environment Settings**):

| Variable Name | Required Value / Description | Example |
|---|---|---|
| `NODE_ENV` | `production` | `production` |
| `PORT` | `10000` (Render default port) | `10000` |
| `API_PREFIX` | `api` — **not** `api/v1`. URI versioning appends the `v1` segment itself, so `api/v1` shifts every route to `/api/v1/v1/*` and breaks every client. | `api` |
| `DATABASE_URL` | Neon PostgreSQL Connection String | `postgresql://<user>:<password>@<host>/<database>?sslmode=require` |
| `JWT_ACCESS_SECRET` | Secret key for access tokens (min 32 chars) | `miran-prod-jwt-access-secret-2024` |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens (min 32 chars) | `miran-prod-jwt-refresh-secret-2024` |
| `CARD_HMAC_SECRET` | Secret key for Digital ID Cards HMAC | `miran-prod-card-hmac-secret-2024` |
| `SWAGGER_ENABLED` | Enable/Disable Swagger Docs (`true`/`false`) | `true` |
| `CORS_ORIGIN` | Allowed CORS Origins | `*` |
| `STORAGE_PROVIDER` | Storage Provider (`local`, `s3`, `azure_blob`) | `local` |

---

## 🔍 Health Check Endpoint
- **URL**: `https://<your-render-app>.onrender.com/health` (excluded from the `api/v1` prefix — not `/api/v1/health`)
- **Swagger Documentation**: `https://<your-render-app>.onrender.com/api/docs`

---

## 🗄️ Database Migration Command
To manually apply pending migrations against Neon:
```bash
npx prisma migrate deploy
```

To manually seed the legacy demo dataset (organizations, trainer/trainee demo
accounts, etc. — upserted by fixed codes) — run only when you actually want
that demo data in the target database, never as part of a normal deploy:
```bash
npx ts-node src/seed/seed.ts
```

---

## 🔑 Initial Admin Credentials (Platform Owner)
- **Email**: `admin@miran.health`
- **Password**: supplied per environment via `SEED_PASSWORD_PLATFORM_OWNER`.
  Never commit a password here. The production seed
  (`src/seed/seed-production.ts`) reads every account password from its own
  environment variable and refuses to run if any is missing.

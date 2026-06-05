# Step 04 — API: auth + users

## Goal

Expose Expo-facing auth and user routes under `app/api/` with path-for-path parity to Express.

## Prerequisites

- [Step 03](step-03-auth-and-middleware.md) — auth services and `verifyAccessToken`

## Tasks

- [ ] `app/api/auth/start/route.ts` — `POST` (email)
- [ ] `app/api/auth/verify/route.ts` — `POST` (email + code)
- [ ] `app/api/auth/resend/route.ts` — `POST`
- [ ] `app/api/auth/refresh/route.ts` — `POST` (refresh token body/cookie per legacy)
- [ ] `app/api/auth/logout/route.ts` — `POST`
- [ ] `app/api/auth/route.ts` — `GET` current user (protected)
- [ ] `app/api/users/[id]/route.ts` — `GET` user by id
- [ ] `app/api/users/welcome/route.ts` — `POST` welcome flow
- [ ] `app/api/users/notifications/token/route.ts` — `POST` push token
- [ ] Match status codes and JSON shapes from legacy controllers
- [ ] Use `verifyAccessToken` on protected routes only

## Files to create

| Next route | Legacy |
|------------|--------|
| `app/api/auth/**/route.ts` | [`routes/api/auth.js`](../../backend-legacy/routes/api/auth.js) |
| `app/api/users/**/route.ts` | [`routes/api/users.js`](../../backend-legacy/routes/api/users.js) |

## Verification

- [ ] Expo login: `start` → email → `verify` → receive access token
- [ ] `GET /api/auth` with `x-auth-token` returns user profile
- [ ] `POST /api/auth/refresh` returns new access token
- [ ] `POST /api/users/notifications/token` persists token on user

## Reference (legacy)

- [`backend-legacy/routes/api/auth.js`](../../backend-legacy/routes/api/auth.js)
- [`backend-legacy/routes/api/users.js`](../../backend-legacy/routes/api/users.js)
- [`frontend/redux`](../../frontend/redux) — auth thunks

## Out of scope

- Wallets (step 05)
- Profile photos (P2)

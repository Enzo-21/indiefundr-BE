# Step 03 — Auth and middleware

## Goal

Port **email OTP-only** passwordless auth (Resend) and request guards: JWT access token (`x-auth-token`) and admin API key. No passwords, social logins, or auth frameworks (NextAuth, etc.). No full HTTP routes yet (step 04).

## Prerequisites

- [Step 01](step-01-prisma-schema.md) — `User`, `RefreshSession`, `OtpVerification`
- [Step 02](step-02-src-lib.md) — env and mailing config

## Tasks

- [ ] Port [`services/authTokens.js`](../../backend-legacy/services/authTokens.js) → `src/services/auth/tokens.ts`
- [ ] Port OTP + user logic from [`controllers/usercontrollers.js`](../../backend-legacy/controllers/usercontrollers.js) → `src/services/auth/passwordless.ts`
- [ ] Port [`controllers/authTokenController.js`](../../backend-legacy/controllers/authTokenController.js) → `src/services/auth/session.ts` (refresh, logout)
- [ ] Port [`services/mailing-service.js`](../../backend-legacy/services/mailing-service.js) → `src/services/mailing/`
- [ ] Port OTP email [`emails/otp-code-email.jsx`](../../backend-legacy/emails/otp-code-email.jsx) (keep JSX or convert to React Email TSX under `src/emails/`)
- [ ] Implement `src/lib/auth/verifyAccessToken.ts` from [`middlewares/authMiddleware.js`](../../backend-legacy/middlewares/authMiddleware.js)
- [ ] Implement `src/lib/auth/verifyAdminApiKey.ts` from [`middlewares/adminAuth.js`](../../backend-legacy/middlewares/adminAuth.js)
- [ ] Helper `src/lib/auth/requireUser.ts` for route handlers (returns user id or throws)

## Files to create

| File | Purpose |
|------|---------|
| `src/services/auth/tokens.ts` | JWT sign/verify |
| `src/services/auth/passwordless.ts` | start, verify, resend OTP |
| `src/services/auth/session.ts` | refresh, logout |
| `src/lib/auth/verifyAccessToken.ts` | Parse `x-auth-token` |
| `src/lib/auth/verifyAdminApiKey.ts` | Admin routes |

## Verification

- [ ] Unit/integration test: issue access + refresh token, verify middleware extracts `userId`
- [ ] Expired token returns payload matching legacy (`TOKEN_EXPIRED` if applicable)
- [ ] Admin helper rejects missing/wrong API key

## Reference (legacy)

- [`backend-legacy/middlewares/authMiddleware.js`](../../backend-legacy/middlewares/authMiddleware.js)
- [`backend-legacy/middlewares/adminAuth.js`](../../backend-legacy/middlewares/adminAuth.js)
- [`frontend/redux/helpers/apiClient.js`](../../frontend/redux/helpers/apiClient.js) — header name

## Out of scope

- Route handlers (step 04)
- Socket.io (replaced by HTTP polling in [step 10](step-10-realtime-polling.md))

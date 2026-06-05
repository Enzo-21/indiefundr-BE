# Step 10 — Realtime (HTTP polling)

## Goal

Replace legacy **Socket.io** with **HTTP polling** on Vercel serverless (no persistent WebSocket server). Update Expo to poll order/investment status on screens that need live updates (subscribe flow, pending redeem).

## Prerequisites

- [Steps 06–09](step-06-api-funds-investments.md) — poll-friendly API routes return order/investment status

## Deployment constraint

**Vercel + Next.js App Router** runs serverless functions. Socket.io does not work on the default Vercel deployment path. Use polling instead.

## Legacy events → polling replacement

| Legacy Socket.io event | Polling replacement |
|----------------------|---------------------|
| `purchase_order_updated` | `GET /api/funds/orders/current?fundId=` or `GET /api/funds/orders/:orderId` |
| `investment_subscribed` | Poll order until `status === completed`, then `GET /api/investments` |
| `investment_updated` | `GET /api/investments` on interval while payability pending |
| `investment_redeemed` | Poll investments/order while redeem in progress |

## Backend tasks

- [ ] Ensure routes return full order/investment state for polling (no Socket emits):
  - `GET /api/funds/orders/current?fundId=`
  - `GET /api/funds/orders/:orderId`
  - `GET /api/investments`
- [ ] Document recommended poll interval (2–3s) and stop conditions in [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [ ] Remove any `global.io` / Socket.io references from new backend code

## Frontend tasks (in scope for this step)

- [ ] Remove `socket.io-client` from [`frontend/package.json`](../../../frontend/package.json)
- [ ] Remove [`socketioActions.js`](../../../frontend/redux/actions/socketioActions.js) and `SocketListeners` from [`frontend/app/_layout.tsx`](../../../frontend/app/_layout.tsx)
- [ ] On [`SubscribeFund.tsx`](../../../frontend/screens/SubscribeFund.tsx): poll `getCurrentPurchaseOrder` every 2–3s while order `queued`/`processing`; stop on terminal status; refresh portfolio
- [ ] Replace global socket refresh handlers with targeted polling where needed (redeem, portfolio)

## Verification

- [ ] Subscribe flow: UI updates when order advances without Socket.io
- [ ] No `socket.io` dependency in frontend lockfile after `npm install`
- [ ] Polling stops when app backgrounds or order completes (no runaway intervals)

## Reference (legacy)

- [`backend-legacy/server.js`](../../backend-legacy/server.js) — Socket.io (deprecated)
- Grep `global.io` in [`backend-legacy/`](../../backend-legacy/) — inventory only

## Out of scope

- Socket.io custom server or sidecar
- Server-Sent Events (unless product requests later)

**Note:** Step 13 cutover requires this step for invest-flow UX parity on Vercel.

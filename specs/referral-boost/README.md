# Referral Boost

## Product

**Boost** is a **high-risk** player power card (same cumulative inventory grants as Recovery Invite). The user activates it on an **active** investment to unlock a **full projected payout** early by inviting friends — or **forfeit the entire investment** if they miss the window.

| Rule | Value |
|------|--------|
| Payout | Full `projectedPayoutUsdt` (normal Pay now) |
| Activate when | `status === active`, before maturity / unlock, and ≥ window days left until `maturesAt` |
| Friends required | `2 × (principal / 25)` (same as Recovery) |
| Invite window | **7 days** from activation (`REFERRAL_BOOST_WINDOW_DAYS`) |
| Deadline | On activate, `maturesAt` is rewritten to `boostExpiresAt` (now + 7 days) |
| Invite qualification | Unchanged referral rules (pending code → first invest) |
| Card consume | On activate (not on success) |
| Slot invitees | No inviter 2 USDT bonus; invitee still gets invitee bonus; invitee invest `excludedFromTriadUnlock` |
| Window expiry | Investment **forfeited** (`boost_window_expired`) — no Recovery, Extra Time, or further waiting |
| Normal flow wins | Boost stays consumed; cancel path restores invitees to standard referrals (user still gets paid) |

## Journeys

### Happy path

1. User with available Boost confirms the high-risk warning, then activates on an active investment with ≥7 days until maturity → card consumed, `boostActivatedAt` set, `maturesAt` set to now+7d, `ReferralBoostLink` created.
2. Within 7 days, N qualifying invitees complete first invest through the user’s code.
3. Each fill marks invitee invest triad-excluded and skips inviter bonus.
4. When slots fill → `completeBoostUnlock` sets `payoutUnlockedAt`, `payoutReason: boost`, `boostCompletedAt`.
5. Admin **Pay now** settles full projected payout from pool.

### Eligibility guard

If fewer than `REFERRAL_BOOST_WINDOW_DAYS` remain until `maturesAt`, activation is rejected (`too_close_to_maturity`) and the UI hides **Use Boost**.

### Normal flow priority

If triad/FIFO unlocks or pays the investment before Boost completes:

- Cancel Boost link (`cancelledAt`)
- Clear `excludedFromTriadUnlock` on slot invitees
- Enqueue missing inviter bonuses
- Card remains used
- Investment is paid via the normal path (not forfeited)

### Window expiry

Maturity cron runs `processExpiredBoostWindows` **before** marking matured investments. Expired open Boosts:

1. Cancel the Boost link and restore slot invitees (same cleanup as cancel)
2. **Forfeit** the investment (`boost_window_expired`)

No unpaid-maturity choice (Recovery / Extra Time) is offered.

## Data

- `PlayerPowerType.boost`
- `Investment.boostActivatedAt` / `boostCompletedAt`
- `ReferralBoostLink` (`inviteIds`, `inviteeInvestmentIds`, `completedAt`, `cancelledAt`)
- `ForfeitureReason.boost_window_expired`
- `PlayerPowerUse` unique on `(investmentId, powerType)` so Boost + later Recovery/Extra Time can coexist on *other* investments only (a forfeited Boost investment is terminal)

## API

`POST /api/investments/:id/boost` — authenticate, activate Boost (after client confirmation modal).

## Out of scope

Auto on-chain payout; changing invite anti-loop rules.

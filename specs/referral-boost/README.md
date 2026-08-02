# Referral Boost

## Product

**Boost** is a player power card (same cumulative inventory grants as Recovery Invite). The user activates it on an **active** investment to unlock a **full projected payout** early by inviting friends.

| Rule | Value |
|------|--------|
| Payout | Full `projectedPayoutUsdt` (normal Pay now) |
| Activate when | `status === active`, before maturity / unlock |
| Friends required | `2 × (principal / 25)` (same as Recovery) |
| Invite window | 3 days from activation |
| Invite qualification | Unchanged referral rules (pending code → first invest) |
| Card consume | On activate (not on success) |
| Slot invitees | No inviter 2 USDT bonus; invitee still gets invitee bonus; invitee invest `excludedFromTriadUnlock` |
| Normal flow wins | Boost stays consumed; cancel path restores invitees to standard referrals |

## Journeys

### Happy path

1. User with available Boost activates on active investment → card consumed, `boostActivatedAt` set, `ReferralBoostLink` created.
2. Within 3 days, N qualifying invitees complete first invest through the user’s code.
3. Each fill marks invitee invest triad-excluded and skips inviter bonus.
4. When slots fill → `completeBoostUnlock` sets `payoutUnlockedAt`, `payoutReason: boost`, `boostCompletedAt`.
5. Admin **Pay now** settles full projected payout from pool.

### Normal flow priority

If triad/FIFO unlocks or pays the investment before Boost completes:

- Cancel Boost link (`cancelledAt`)
- Clear `excludedFromTriadUnlock` on slot invitees
- Enqueue missing inviter bonuses
- Card remains used

### Window expiry

Maturity cron runs `processExpiredBoostWindows`. Expired open Boosts cancel the same way (card stays used; investment stays in normal queue).

## Data

- `PlayerPowerType.boost`
- `Investment.boostActivatedAt` / `boostCompletedAt`
- `ReferralBoostLink` (`inviteIds`, `inviteeInvestmentIds`, `completedAt`, `cancelledAt`)
- `PlayerPowerUse` unique on `(investmentId, powerType)` so Boost + later Recovery/Extra Time can coexist

## API

`POST /api/investments/:id/boost` — authenticate, activate Boost.

## Out of scope

Auto on-chain payout; changing invite anti-loop rules.

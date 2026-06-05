# TRON memo — implementation steps (code)

Companion to [TRON_TRANSACTION_MEMO_RECONCILIATION.md](./TRON_TRANSACTION_MEMO_RECONCILIATION.md). Apply these in **Agent mode** (Plan mode cannot edit `.ts` files).

## Checklist

- [ ] 1. `src/lib/tron/transactionMemo.ts` + tests
- [ ] 2. `src/lib/env.ts` + `.env.example`
- [ ] 3. `src/services/tron/client.ts` — `addUpdateData`, `getTransactionMemo`, `transferUsdt({ memo })`
- [ ] 4. `src/prisma/schema.prisma` — `chainMemo` / `memo` fields → `npm run db:push`
- [ ] 5. `purchaseOrderProcessor.ts` + `payoutScheduler.ts` + `investments.ts`
- [ ] 6. `src/services/wallets/walletActivityMemo.ts` — validate + classify
- [ ] 7. `walletActivityFromChain.ts` — fetch memos, memo-first merge
- [ ] 8. `walletSyncService.ts` — persist memo on `WalletChainTransfer`
- [ ] 9. Run tests: `node --import tsx --test src/lib/tron/transactionMemo.test.ts`

---

## 1. `src/lib/tron/transactionMemo.ts`

Create file with: `buildIndieFundrMemo`, `parseIndieFundrMemo`, `memoFromTransactionRawData`, `isIndieFundrChainMemoEnabled`, types `IndieFundrMemo`, `IndieFundrMemoKind`, max length 120, fundId `[a-z0-9_-]+`, entityId 24-char hex.

## 2. Env (`src/lib/env.ts`)

```typescript
INDIEFUNDR_CHAIN_MEMO_ENABLED: z.string().optional(),
INDIEFUNDR_CHAIN_MEMO_VERSION: z.coerce.number().default(1),
// buildEnv:
indieFundrChainMemoEnabled: envFlag(raw.INDIEFUNDR_CHAIN_MEMO_ENABLED, false),
indieFundrChainMemoVersion: raw.INDIEFUNDR_CHAIN_MEMO_VERSION,
```

## 3. Tron client (`src/services/tron/client.ts`)

Extend `TronWebInstance.transactionBuilder`:

```typescript
addUpdateData: (
  unsignedTransaction: unknown,
  memo: string,
  dataFormat?: "utf8" | "hex",
  options?: { txLocal?: boolean }
) => Promise<unknown>;
```

Extend `Transaction` type:

```typescript
raw_data?: { data?: string };
```

**`transferUsdt`:** add optional `memo?: string`. After `triggerSmartContract`, if `memo && getEnv().indieFundrChainMemoEnabled`:

```typescript
let unsigned = transaction.transaction;
unsigned = await tronWeb.transactionBuilder.addUpdateData(unsigned, memo);
const signed = await tronWeb.trx.sign(unsigned);
```

**Export `getTransactionMemo(txId)`:** `getTransaction` → `memoFromTransactionRawData(tx.raw_data?.data)`.

**Export `getTransactionMemosBatch(txIds, { concurrency })`:** map with limiter.

## 4. Prisma

```prisma
model PurchaseOrder {
  chainMemo String?
}
model Investment {
  chainMemo String?
}
model WalletChainTransfer {
  memo String?
}
```

## 5. Broadcast sites

**purchaseOrderProcessor** (before `transferUsdt`):

```typescript
import { buildIndieFundrMemo, isIndieFundrChainMemoEnabled } from "@/lib/tron/transactionMemo";

const memo = isIndieFundrChainMemoEnabled()
  ? buildIndieFundrMemo({ kind: "invest", fundId: order.fundId, entityId: order.id })
  : undefined;

signedTransaction = await tron.transferUsdt({
  fromPrivateKey: wallet.privateKey,
  toAddress: treasuryAddress,
  amount: order.costUsdt,
  memo,
});
// On prisma.purchaseOrder.update: chainMemo: memo ?? undefined
```

**payoutScheduler** / **investments.ts**:

```typescript
buildIndieFundrMemo({ kind: "redeem", fundId: investment.fundId, entityId: investment.id })
```

## 6. `src/services/wallets/walletActivityMemo.ts`

`classifyChainRowFromMemo({ userId, walletId, walletAddress, treasuryAddress, row, parsedMemo })`:

- Load order/investment by `entityId`; verify `userId` + `walletId`
- Validate amount (±0.0001 USDT) and direction (invest: out to treasury; redeem: in from treasury)
- Return `WalletActivityTx` with `source: "app"` and fund label from `getFundById`

## 7. `walletActivityFromChain.ts`

After enriching chain rows:

1. Batch `getTransactionMemo` per txId
2. In `mergeChainRowsWithDbIndex`, for each row: if valid memo classification → use it; else existing DB index / generic chain

Log `classificationSource` counts in `uiSnapshotLog`.

## 8. `walletSyncService.ts`

On upsert, set `memo` from `getTransactionMemo(row.txId)` and `raw: { ...row, memo, parsedMemo }`.

---

## Enable on Shasta

```bash
INDIEFUNDR_CHAIN_MEMO_ENABLED=true
```

Verify new investment tx on TronScan shows memo `INDIEFUNDR/1/invest/...`.

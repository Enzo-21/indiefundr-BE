import { getEnv } from "@/lib/env";
import {
  isIndieFundrChainMemoEnabled,
  memoFromTransactionRawData,
} from "@/lib/tron/transactionMemo";
import { decodeTronMessage } from "@/lib/utils/tronErrors";
import { fetchWithTronRateLimit, runWithTronLimiter } from "./rateLimit";

const USDT_DECIMALS = 6;
const DEFAULT_ENERGY_FEE_SUN = 420;
const DEFAULT_BANDWIDTH_FEE_SUN = 1000;
const FEE_BUFFER_RATIO = 1.15;
/** Typical byte size for a plain TRX TransferContract. */
const TRX_TRANSFER_TX_BYTES = 269;
/** Conservative buffered fee when account resources cannot be read. */
const TRX_TRANSFER_FEE_FALLBACK_TRX = 0.3;
const READ_ONLY_CALLER_ADDRESS = "TPnBjYQEMo4Yd4866KCzXdi4a169KGd63n";

type TransactionInfo = {
  id?: string;
  blockNumber?: number;
  fee?: number;
  resMessage?: string;
  contractResult?: string | string[];
  receipt?: { result?: string; energy_fee?: number; net_fee?: number };
  result?: string;
};

export type TransactionFailureReason = {
  retryable: boolean;
  code: string;
  feeTrx: number;
  message: string;
};

type Transaction = {
  ret?: { contractRet?: string }[];
  raw_data?: { data?: string };
};

// TronWeb types are loose; use dynamic import with unknown to avoid brittle ABI typings.
type TronWebInstance = {
  createAccount: () => Promise<{
    address: { base58: string };
    privateKey: string;
  }>;
  setAddress: (address: string) => void;
  defaultAddress: { base58: string };
  contract: () => { at: (address: string) => Promise<Record<string, unknown>> };
  trx: {
    getAccount: (address: string) => Promise<{ address?: string }>;
    getBalance: (address: string) => Promise<number>;
    getTransactionInfo: (txId: string) => Promise<TransactionInfo | null>;
    getTransaction: (txId: string) => Promise<Transaction | null>;
    getAccountResources: (address: string) => Promise<Record<string, unknown>>;
    getChainParameters: () => Promise<Array<{ key?: string; value?: number }>>;
    sign: (tx: unknown) => Promise<Record<string, unknown>>;
    sendRawTransaction: (signed: unknown) => Promise<{
      result?: boolean;
      message?: string;
      txid?: string;
    }>;
    sendTransaction: (
      toAddress: string,
      amountSun: number
    ) => Promise<{
      result?: boolean;
      message?: string;
      txid?: string;
      transaction?: { txID?: string };
    }>;
  };
  transactionBuilder: {
    triggerConstantContract: (
      contract: string,
      functionSelector: string,
      options: Record<string, unknown>,
      parameters: Array<{ type: string; value: unknown }>,
      issuerAddress: string
    ) => Promise<{
      result?: { result?: boolean; message?: string };
      energy_used?: number;
      energy_required?: number;
      transaction?: { raw_data?: unknown };
    }>;
    triggerSmartContract: (
      contract: string,
      functionSelector: string,
      options: Record<string, unknown>,
      parameters: Array<{ type: string; value: unknown }>,
      issuerAddress: string
    ) => Promise<{
      result?: { result?: boolean };
      transaction?: unknown;
    }>;
    addUpdateData: (
      unsignedTransaction: unknown,
      memo: string,
      dataFormat?: "utf8" | "hex",
      options?: { txLocal?: boolean }
    ) => Promise<unknown>;
  };
  fromSun: (sun: number) => number;
};

type TronWebCtor = {
  new (options: Record<string, unknown>): TronWebInstance;
  isAddress: (address?: unknown) => boolean;
  address: {
    fromHex: (address: string) => string;
  };
};

let cachedTronWebCtor: TronWebCtor | null = null;

async function loadTronWeb(): Promise<TronWebCtor> {
  if (cachedTronWebCtor) return cachedTronWebCtor;
  const mod = (await import("tronweb")) as unknown as {
    TronWeb?: TronWebCtor;
    default?: TronWebCtor;
  };
  const TronWeb = mod.TronWeb || mod.default;
  if (!TronWeb) {
    throw new Error("Failed to load TronWeb");
  }
  cachedTronWebCtor = TronWeb;
  return TronWeb;
}

export function getNetworkConfig() {
  const env = getEnv();
  if (env.blockchainNetwork === "mainnet") {
    return {
      fullHost: env.tronMainnetFullHost,
      usdtContract: env.usdtTrc20MainnetContract,
    };
  }
  return {
    fullHost: env.tronTestnetFullHost,
    usdtContract: env.usdtTrc20TestnetContract,
  };
}

async function createTronWeb(
  privateKey?: string | null
): Promise<TronWebInstance> {
  const TronWeb = await loadTronWeb();
  const { fullHost } = getNetworkConfig();
  const headers: Record<string, string> = {};
  const apiKey = getEnv().tronApiKey;
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }

  const options: {
    fullHost: string;
    headers?: Record<string, string>;
    privateKey?: string;
  } = { fullHost, headers };

  if (privateKey) {
    options.privateKey = privateKey;
  }

  const tronWeb = new TronWeb(options);

  if (!privateKey) {
    tronWeb.setAddress(READ_ONLY_CALLER_ADDRESS);
  }

  return tronWeb;
}

function fromUsdtSun(sun: number | bigint | string): number {
  return Number(sun) / Math.pow(10, USDT_DECIMALS);
}

export function toUsdtSun(amount: number): number {
  return Math.round(Number(amount) * Math.pow(10, USDT_DECIMALS));
}

export { fromUsdtSun };

/** Canonical base58 Tron address for reliable comparisons. */
export async function normalizeTronAddress(
  address: string
): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const TronWeb = await loadTronWeb();
  if (!TronWeb.isAddress(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("T")) {
    return trimmed;
  }

  try {
    const base58 = TronWeb.address.fromHex(trimmed.replace(/^0x/i, ""));
    return base58 || null;
  } catch {
    return null;
  }
}

const TRX_SUN = 1_000_000;

/** TRX balance from sun; avoids TronWeb v6 fromSun returning non-number types. */
function fromTrxSun(sun: number | bigint | string): number {
  const sunValue = Number(sun);
  if (!Number.isFinite(sunValue)) {
    return 0;
  }
  return sunValue / TRX_SUN;
}

export async function getTrxBalance(address: string): Promise<number> {
  const tronWeb = await createTronWeb();
  const balanceSun = await runWithTronLimiter("trx.getBalance", () =>
    tronWeb.trx.getBalance(address)
  );
  return parseFloat(fromTrxSun(balanceSun).toFixed(6));
}

/** True once the address has received its first TRX (on-chain account exists). */
export async function isAccountActivatedOnChain(
  address: string
): Promise<boolean> {
  const tronWeb = await createTronWeb();
  try {
    const account = await runWithTronLimiter("trx.getAccount", () =>
      tronWeb.trx.getAccount(address)
    );
    return Boolean(account?.address);
  } catch {
    return false;
  }
}

async function getEnergyFeeSun(
  tronWeb: InstanceType<TronWebCtor>
): Promise<number> {
  try {
    const params = await runWithTronLimiter("trx.getChainParameters", () =>
      tronWeb.trx.getChainParameters()
    );
    const entry = params.find((p) => p.key === "getEnergyFee");
    if (entry?.value != null) {
      return Number(entry.value);
    }
  } catch (err) {
    console.warn(
      "[tron] getEnergyFee failed:",
      err instanceof Error ? err.message : err
    );
  }
  return DEFAULT_ENERGY_FEE_SUN;
}

function getAccountEnergyAvailable(resources: Record<string, unknown>): number {
  const limit = Number(resources.EnergyLimit ?? 0);
  const used = Number(resources.EnergyUsed ?? 0);
  return Math.max(0, limit - used);
}

function getAccountBandwidthAvailable(
  resources: Record<string, unknown>
): number {
  const freeNetLimit = Number(resources.freeNetLimit ?? 0);
  const freeNetUsed = Number(resources.freeNetUsed ?? 0);
  const netLimit = Number(resources.NetLimit ?? 0);
  const netUsed = Number(resources.NetUsed ?? 0);
  const free = Math.max(0, freeNetLimit - freeNetUsed);
  const staked = Math.max(0, netLimit - netUsed);
  return free + staked;
}

export type UsdtTransferEstimate = {
  fromAddress: string;
  toAddress: string;
  amountUsdt: number;
  energyUsed: number;
  energyAvailable: number;
  energyBillable: number;
  energyPriceSun: number;
  estimatedTrx: number;
  estimatedTrxBase: number;
  feeBufferPercent: number;
  trxBalance: number;
  usdtBalance: number;
  hasEnoughTrx: boolean;
  hasEnoughUsdt: boolean;
  canTransfer: boolean;
};

export async function estimateUsdtTransfer({
  fromAddress,
  toAddress,
  amount,
}: {
  fromAddress: string;
  toAddress: string;
  amount: number;
}): Promise<UsdtTransferEstimate> {
  const tronWeb = await createTronWeb();
  tronWeb.setAddress(fromAddress);
  const { usdtContract } = getNetworkConfig();
  const amountSun = toUsdtSun(amount);

  const simulation = await runWithTronLimiter(
    "transactionBuilder.triggerConstantContract",
    () =>
      tronWeb.transactionBuilder.triggerConstantContract(
        usdtContract,
        "transfer(address,uint256)",
        { feeLimit: 150_000_000, callValue: 0 },
        [
          { type: "address", value: toAddress },
          { type: "uint256", value: amountSun },
        ],
        fromAddress
      )
  );

  if (!simulation?.result?.result) {
    const msg =
      decodeTronMessage(simulation?.result?.message) ||
      "Transfer simulation failed";
    throw new Error(msg);
  }

  const energyUsedRaw = Number(
    simulation.energy_used || simulation.energy_required || 0
  );
  const energyUsed = energyUsedRaw > 0 ? energyUsedRaw : 65000;
  const energyPriceSun = await getEnergyFeeSun(tronWeb);

  let resources: Record<string, unknown> = {};
  try {
    resources = await runWithTronLimiter("trx.getAccountResources", () =>
      tronWeb.trx.getAccountResources(fromAddress)
    );
  } catch (err) {
    console.warn(
      "[tron] getAccountResources failed:",
      err instanceof Error ? err.message : err
    );
  }

  const energyAvailable = getAccountEnergyAvailable(resources);
  const bandwidthAvailable = getAccountBandwidthAvailable(resources);
  const energyBillable = Math.max(0, energyUsed - energyAvailable);
  const energyCostSun = energyBillable * energyPriceSun;
  const txBytes = simulation.transaction?.raw_data
    ? JSON.stringify(simulation.transaction.raw_data).length
    : 350;
  const bandwidthBillable = Math.max(0, txBytes - bandwidthAvailable);
  const bandwidthCostSun = bandwidthBillable * DEFAULT_BANDWIDTH_FEE_SUN;
  const estimatedTrxBase = (energyCostSun + bandwidthCostSun) / 1e6;
  const estimatedTrx = parseFloat(
    (estimatedTrxBase * FEE_BUFFER_RATIO).toFixed(4)
  );

  const [trxBalance, usdtBalance] = await Promise.all([
    getTrxBalance(fromAddress),
    getUsdtBalance(fromAddress),
  ]);

  return {
    fromAddress,
    toAddress,
    amountUsdt: Number(amount),
    energyUsed,
    energyAvailable,
    energyBillable,
    energyPriceSun,
    estimatedTrx,
    estimatedTrxBase: parseFloat(estimatedTrxBase.toFixed(6)),
    feeBufferPercent: Math.round((FEE_BUFFER_RATIO - 1) * 100),
    trxBalance,
    usdtBalance,
    hasEnoughTrx: trxBalance >= estimatedTrx,
    hasEnoughUsdt: usdtBalance >= amount,
    canTransfer: trxBalance >= estimatedTrx && usdtBalance >= amount,
  };
}

export async function transferUsdt({
  fromPrivateKey,
  toAddress,
  amount,
  memo,
}: {
  fromPrivateKey: string;
  toAddress: string;
  amount: number;
  memo?: string;
}): Promise<Record<string, unknown>> {
  const tronWeb = await createTronWeb(fromPrivateKey);
  const { usdtContract } = getNetworkConfig();
  const fromAddress = tronWeb.defaultAddress.base58;
  const amountSun = toUsdtSun(amount);

  const transaction = await runWithTronLimiter(
    "transactionBuilder.triggerSmartContract",
    () =>
      tronWeb.transactionBuilder.triggerSmartContract(
        usdtContract,
        "transfer(address,uint256)",
        { feeLimit: 150_000_000, callValue: 0 },
        [
          { type: "address", value: toAddress },
          { type: "uint256", value: amountSun },
        ],
        fromAddress
      )
  );

  if (!transaction.result?.result) {
    throw new Error("Failed to build USDT transfer transaction");
  }

  let unsignedTx = transaction.transaction;
  if (memo && isIndieFundrChainMemoEnabled()) {
    unsignedTx = await runWithTronLimiter(
      "transactionBuilder.addUpdateData",
      () => tronWeb.transactionBuilder.addUpdateData(unsignedTx, memo)
    );
  }

  const signed = await runWithTronLimiter("trx.sign", () =>
    tronWeb.trx.sign(unsignedTx)
  );
  const broadcast = await runWithTronLimiter("trx.sendRawTransaction", () =>
    tronWeb.trx.sendRawTransaction(signed)
  );

  if (!broadcast.result) {
    const decoded = decodeTronMessage(broadcast.message);
    throw new Error(decoded || "Failed to broadcast transaction");
  }

  const txID = broadcast.txid || (signed.txID as string | undefined);
  return {
    txID,
    transactionHash: txID,
    raw: signed,
    broadcast,
  };
}

export async function createAccount(): Promise<{
  address: string;
  privateKey: string;
}> {
  const tronWeb = await createTronWeb();
  const account = await runWithTronLimiter("tronWeb.createAccount", () =>
    tronWeb.createAccount()
  );
  return {
    address: account.address.base58,
    privateKey: account.privateKey,
  };
}

export async function validateAddress(address: string): Promise<boolean> {
  const TronWeb = await loadTronWeb();
  return TronWeb.isAddress(address);
}

export async function privateKeyToAddress(privateKey: string): Promise<string> {
  const tronWeb = await createTronWeb(privateKey);
  return tronWeb.defaultAddress.base58;
}

export async function getUsdtBalance(address: string): Promise<number> {
  const TronWeb = await loadTronWeb();
  const tronWeb = await createTronWeb();
  const { usdtContract } = getNetworkConfig();

  if (!TronWeb.isAddress(usdtContract)) {
    throw new Error(`Invalid USDT contract address in config: ${usdtContract}`);
  }

  const contract = (await runWithTronLimiter("contract.at", () =>
    tronWeb.contract().at(usdtContract)
  )) as {
    balanceOf: (addr: string) => { call: () => Promise<unknown> };
  };
  const balance = await runWithTronLimiter("contract.balanceOf.call", () =>
    contract.balanceOf(address).call()
  );
  return parseFloat(fromUsdtSun(balance as number).toFixed(4));
}

export function getTxId(
  transaction: Record<string, unknown> | null | undefined
): string | null {
  if (!transaction) return null;
  const txId =
    transaction.txID ||
    transaction.transactionHash ||
    transaction.txid;
  return txId ? String(txId) : null;
}

async function getTransactionInfo(txId: string): Promise<TransactionInfo | null> {
  const tronWeb = await createTronWeb();
  return runWithTronLimiter("trx.getTransactionInfo", () =>
    tronWeb.trx.getTransactionInfo(txId)
  );
}

async function getTransaction(txId: string): Promise<Transaction | null> {
  const tronWeb = await createTronWeb();
  return runWithTronLimiter("trx.getTransaction", () =>
    tronWeb.trx.getTransaction(txId)
  );
}

export async function getTransactionMemo(txId: string): Promise<string | null> {
  const tx = await getTransaction(txId);
  return memoFromTransactionRawData(tx?.raw_data?.data);
}

export async function getTransactionMemosBatch(
  txIds: string[],
  { concurrency }: { concurrency?: number } = {}
): Promise<Map<string, string | null>> {
  const env = getEnv();
  const limit = concurrency ?? env.walletActivityStatusConcurrency;
  const result = new Map<string, string | null>();

  for (let i = 0; i < txIds.length; i += limit) {
    const batch = txIds.slice(i, i + limit);
    const memos = await Promise.all(
      batch.map(async (txId) => ({
        txId,
        memo: await getTransactionMemo(txId),
      }))
    );
    for (const { txId, memo } of memos) {
      result.set(txId, memo);
    }
  }

  return result;
}

export type ChainTxInspection = {
  txId: string;
  transactionInfo: TransactionInfo | null;
  transaction: Transaction | null;
  status: "pending" | "success" | "failed";
  usdtTransferSuccessful: boolean;
  lookupFailed?: boolean;
};

function deriveStatusFromInspection(
  info: TransactionInfo | null,
  tx: Transaction | null
): "pending" | "success" | "failed" {
  if (!info || !info.id) {
    return "pending";
  }

  const receiptResult = info.receipt?.result;
  if (receiptResult === "SUCCESS") {
    return "success";
  }
  if (receiptResult && receiptResult !== "SUCCESS") {
    return "failed";
  }

  if (!info.blockNumber) {
    return "pending";
  }

  const contractRet = tx?.ret?.[0]?.contractRet;
  if (contractRet === "SUCCESS") {
    return "success";
  }
  if (contractRet) {
    return "failed";
  }

  return "pending";
}

function deriveUsdtTransferSuccessful(
  info: TransactionInfo | null,
  tx: Transaction | null
): boolean {
  if (!info?.id) {
    return false;
  }
  if (info.receipt?.result === "SUCCESS") {
    return true;
  }
  if (!info.blockNumber) {
    return false;
  }
  return tx?.ret?.[0]?.contractRet === "SUCCESS";
}

/** Single TronGrid read for status + USDT success + debug logging. */
export async function inspectTransactionOnChain(
  txId: string
): Promise<ChainTxInspection> {
  try {
    const transactionInfo = await getTransactionInfo(txId);
    const transaction =
      transactionInfo?.id != null ? await getTransaction(txId) : null;

    const status = deriveStatusFromInspection(transactionInfo, transaction);
    const usdtTransferSuccessful = deriveUsdtTransferSuccessful(
      transactionInfo,
      transaction
    );

    return {
      txId,
      transactionInfo,
      transaction,
      status,
      usdtTransferSuccessful,
    };
  } catch {
    return {
      txId,
      transactionInfo: null,
      transaction: null,
      status: "pending",
      usdtTransferSuccessful: false,
      lookupFailed: true,
    };
  }
}

export function logTronTransactionInspection(
  context: string,
  inspection: ChainTxInspection,
  extra?: Record<string, unknown>
): void {
  if (!getEnv().purchaseOrderTronDebug) {
    return;
  }

  console.log("[tron:tx]", {
    context,
    txId: inspection.txId,
    status: inspection.status,
    usdtTransferSuccessful: inspection.usdtTransferSuccessful,
    transactionInfo: inspection.transactionInfo,
    transaction: inspection.transaction,
    ...extra,
  });
}

export async function getTransactionStatus(
  txId: string
): Promise<"pending" | "success" | "failed"> {
  const inspection = await inspectTransactionOnChain(txId);
  return inspection.status;
}

/** Definitive on-chain success check for a broadcast USDT transfer (receipt + contractRet). */
export async function isUsdtTransferSuccessful(txId: string): Promise<boolean> {
  const inspection = await inspectTransactionOnChain(txId);
  return inspection.usdtTransferSuccessful;
}

function mapTronStatusToActivity(
  tronStatus: "pending" | "success" | "failed"
): "confirmed" | "failed" | "pending" {
  if (tronStatus === "success") return "confirmed";
  if (tronStatus === "failed") return "failed";
  return "pending";
}

export type Trc20ActivityStatus = "confirmed" | "failed" | "pending";

export function mapInspectionToActivityStatus(
  inspection: Pick<ChainTxInspection, "status" | "lookupFailed">,
  fallbackStatusOnLookupError?: Trc20ActivityStatus
): Trc20ActivityStatus {
  if (inspection.lookupFailed && fallbackStatusOnLookupError) {
    return fallbackStatusOnLookupError;
  }
  return mapTronStatusToActivity(inspection.status);
}

export type Trc20TransferRow = {
  txId: string;
  type: "in" | "out";
  amount: number;
  date: Date;
  from: string;
  to: string;
};

type Trc20ApiRow = {
  value?: string;
  token_info?: { decimals?: number };
  to?: string;
  from?: string;
  transaction_id?: string;
  block_timestamp?: number;
};

async function mapTrc20ApiRows(
  address: string,
  rows: Trc20ApiRow[]
): Promise<Trc20TransferRow[]> {
  const addressNorm = (await normalizeTronAddress(address)) ?? address.trim();

  return Promise.all(
    rows.map(async (row) => {
      const decimals = row.token_info?.decimals ?? USDT_DECIMALS;
      const rawValue = Number(row.value || 0);
      const amount = parseFloat((rawValue / Math.pow(10, decimals)).toFixed(4));
      const fromRaw = row.from || "";
      const toRaw = row.to || "";
      const fromNorm = (await normalizeTronAddress(fromRaw)) ?? fromRaw;
      const toNorm = (await normalizeTronAddress(toRaw)) ?? toRaw;
      const type: "in" | "out" = toNorm === addressNorm ? "in" : "out";

      return {
        txId: row.transaction_id || "",
        type,
        amount,
        date: new Date(row.block_timestamp || 0),
        from: fromNorm,
        to: toNorm,
      };
    })
  );
}

export async function getTrc20UsdtTransfers(
  address: string,
  { limit = 30 }: { limit?: number } = {}
): Promise<Trc20TransferRow[]> {
  const { fullHost, usdtContract } = getNetworkConfig();
  const apiKey = getEnv().tronApiKey;
  const url = new URL(`${fullHost}/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("contract_address", usdtContract);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }

  const response = await fetchWithTronRateLimit(url.toString(), { headers }, {
    cacheTtlMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(`TronGrid TRC20 history failed: ${response.status}`);
  }

  const body = (await response.json()) as { data?: Trc20ApiRow[] };
  return mapTrc20ApiRows(address, body.data || []);
}

export type TrxTransferRow = {
  txId: string;
  from: string;
  to: string;
  amountTrx: number;
  date: Date;
  contractRet: string | null;
};

type TrxNativeApiRow = {
  txID?: string;
  block_timestamp?: number;
  ret?: Array<{ contractRet?: string }>;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: {
        value?: {
          amount?: number;
          owner_address?: string;
          to_address?: string;
        };
      };
    }>;
  };
};

async function mapTrxNativeApiRows(
  walletAddress: string,
  rows: TrxNativeApiRow[]
): Promise<TrxTransferRow[]> {
  const walletNorm =
    (await normalizeTronAddress(walletAddress)) ?? walletAddress.trim();
  const mapped: TrxTransferRow[] = [];

  for (const row of rows) {
    const contract = row.raw_data?.contract?.[0];
    if (contract?.type !== "TransferContract") continue;

    const value = contract.parameter?.value;
    if (!value?.to_address || !value.owner_address) continue;

    const toNorm =
      (await normalizeTronAddress(value.to_address)) ?? value.to_address;
    if (toNorm !== walletNorm) continue;

    const fromNorm =
      (await normalizeTronAddress(value.owner_address)) ?? value.owner_address;
    const amountTrx = parseFloat(fromTrxSun(value.amount ?? 0).toFixed(6));

    mapped.push({
      txId: row.txID || "",
      from: fromNorm,
      to: toNorm,
      amountTrx,
      date: new Date(row.block_timestamp || 0),
      contractRet: row.ret?.[0]?.contractRet ?? null,
    });
  }

  return mapped;
}

/** Confirmed TRX transfers received by an address (treasury top-ups, activation, etc.). */
export async function getIncomingTrxTransfers(
  address: string,
  {
    limit = 50,
    minTimestampMs,
    maxTimestampMs,
  }: {
    limit?: number;
    minTimestampMs?: number;
    maxTimestampMs?: number;
  } = {}
): Promise<TrxTransferRow[]> {
  const { fullHost } = getNetworkConfig();
  const apiKey = getEnv().tronApiKey;
  const url = new URL(`${fullHost}/v1/accounts/${address}/transactions`);
  url.searchParams.set("only_to", "true");
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order_by", "block_timestamp,desc");
  if (minTimestampMs != null) {
    url.searchParams.set("min_timestamp", String(minTimestampMs));
  }
  if (maxTimestampMs != null) {
    url.searchParams.set("max_timestamp", String(maxTimestampMs));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }

  const response = await fetchWithTronRateLimit(url.toString(), { headers }, {
    cacheTtlMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(`TronGrid TRX history failed: ${response.status}`);
  }

  const body = (await response.json()) as { data?: TrxNativeApiRow[] };
  return mapTrxNativeApiRows(address, body.data || []);
}

const ACTIVATION_AMOUNT_EPSILON_TRX = 0.000001;

/** Pick treasury activation TRX transfer when DB tx id was cleared but wallet is active. */
export function pickWalletActivationTxId(
  transfers: TrxTransferRow[],
  {
    treasuryAddress,
    expectedAmountTrx,
    activatedAt,
  }: {
    treasuryAddress: string;
    expectedAmountTrx: number;
    activatedAt?: Date | null;
  }
): string | null {
  const treasuryNorm = treasuryAddress.trim();
  const candidates = transfers.filter((row) => {
    if (!row.txId || row.contractRet !== "SUCCESS") return false;
    if (row.from !== treasuryNorm) return false;
    return (
      Math.abs(row.amountTrx - expectedAmountTrx) <= ACTIVATION_AMOUNT_EPSILON_TRX
    );
  });

  if (!candidates.length) {
    return null;
  }

  if (!activatedAt) {
    return candidates[0]?.txId ?? null;
  }

  const targetMs = activatedAt.getTime();
  candidates.sort(
    (a, b) =>
      Math.abs(a.date.getTime() - targetMs) - Math.abs(b.date.getTime() - targetMs)
  );
  return candidates[0]?.txId ?? null;
}

export async function findWalletActivationTxOnChain({
  walletAddress,
  treasuryAddress,
  expectedAmountTrx,
  activatedAt,
}: {
  walletAddress: string;
  treasuryAddress: string;
  expectedAmountTrx: number;
  activatedAt?: Date | null;
}): Promise<string | null> {
  const treasuryNorm =
    (await normalizeTronAddress(treasuryAddress)) ?? treasuryAddress.trim();
  const minTimestampMs = activatedAt
    ? activatedAt.getTime() - 24 * 60 * 60 * 1000
    : undefined;
  const maxTimestampMs = activatedAt
    ? activatedAt.getTime() + 60 * 60 * 1000
    : undefined;

  const transfers = await getIncomingTrxTransfers(walletAddress, {
    limit: 50,
    minTimestampMs,
    maxTimestampMs,
  });

  return pickWalletActivationTxId(transfers, {
    treasuryAddress: treasuryNorm,
    expectedAmountTrx,
    activatedAt,
  });
}

export type FetchTrc20UsdtTransfersOpts = {
  maxRows?: number;
  pageSize?: number;
  minTimestampMs?: number;
};

/** Paginated TRC20 fetch with optional min_timestamp (incremental sync). */
export async function fetchTrc20UsdtTransfers(
  address: string,
  {
    maxRows = 500,
    pageSize: pageSizeOption,
    minTimestampMs,
  }: FetchTrc20UsdtTransfersOpts = {}
): Promise<Trc20TransferRow[]> {
  const { fullHost, usdtContract } = getNetworkConfig();
  const apiKey = getEnv().tronApiKey;
  const pageSize = Math.min(200, pageSizeOption ?? 200, maxRows);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }

  const all: Trc20TransferRow[] = [];
  let fingerprint: string | undefined;

  while (all.length < maxRows) {
    const url = new URL(`${fullHost}/v1/accounts/${address}/transactions/trc20`);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("contract_address", usdtContract);
    if (fingerprint) {
      url.searchParams.set("fingerprint", fingerprint);
    }
    if (minTimestampMs != null && minTimestampMs > 0) {
      url.searchParams.set("min_timestamp", String(minTimestampMs));
    }

    const response = await fetchWithTronRateLimit(url.toString(), { headers }, {
      cacheTtlMs: minTimestampMs != null ? 5_000 : 5_000,
    });
    if (!response.ok) {
      throw new Error(`TronGrid TRC20 history failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: Trc20ApiRow[];
      meta?: { fingerprint?: string };
    };
    const page = await mapTrc20ApiRows(address, body.data || []);
    if (!page.length) break;

    all.push(...page);
    fingerprint = body.meta?.fingerprint;
    if (!fingerprint || page.length < pageSize) break;
  }

  return all.slice(0, maxRows);
}

/** Paginated TRC20 history for admin aggregates (capped total rows). */
export async function getTrc20UsdtTransfersPaginated(
  address: string,
  { maxRows = 500 }: { maxRows?: number } = {}
): Promise<Trc20TransferRow[]> {
  return fetchTrc20UsdtTransfers(address, { maxRows });
}

/** Incremental TRC20 history from a watermark (with overlap applied by caller). */
export async function getTrc20UsdtTransfersSince(
  address: string,
  {
    minTimestampMs,
    maxRows,
  }: { minTimestampMs: number; maxRows?: number }
): Promise<Trc20TransferRow[]> {
  return fetchTrc20UsdtTransfers(address, {
    minTimestampMs,
    maxRows: maxRows ?? getEnv().walletChainSyncMaxRows,
  });
}

export async function enrichTrc20TransferStatuses<
  T extends Trc20TransferRow
>(
  rows: T[],
  {
    concurrency = 10,
    fallbackStatusOnLookupError,
    inspectTransaction = inspectTransactionOnChain,
  }: {
    concurrency?: number;
    fallbackStatusOnLookupError?: Trc20ActivityStatus;
    inspectTransaction?: (txId: string) => Promise<ChainTxInspection>;
  } = {}
): Promise<Array<T & { status: "confirmed" | "failed" | "pending" }>> {
  if (!rows.length) return [];

  const enriched: Array<T & { status: "confirmed" | "failed" | "pending" }> =
    [];

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const statuses = await Promise.all(
      batch.map(async (row) => {
        if (!row.txId) return "pending" as const;
        try {
          const inspection = await inspectTransaction(row.txId);
          return mapInspectionToActivityStatus(
            inspection,
            fallbackStatusOnLookupError
          );
        } catch {
          return fallbackStatusOnLookupError ?? "pending";
        }
      })
    );
    for (let j = 0; j < batch.length; j++) {
      enriched.push({
        ...batch[j],
        status: statuses[j],
      });
    }
  }

  return enriched;
}

export function sumPendingInboundUsdt(
  rows: Array<Pick<Trc20TransferRow, "type" | "amount"> & { status: Trc20ActivityStatus }>
): number {
  return parseFloat(
    rows
      .filter((row) => row.type === "in" && row.status === "pending")
      .reduce((sum, row) => sum + row.amount, 0)
      .toFixed(4)
  );
}

/** On-chain USDT minus inbound transfers still awaiting confirmation. */
export function subtractPendingInboundUsdt(
  onChainUsdt: number,
  pendingInbound: number
): number {
  return parseFloat(Math.max(0, onChainUsdt - pendingInbound).toFixed(4));
}

export async function getPendingIncomingUsdtTotal(
  address: string,
  {
    limit,
    concurrency,
  }: { limit?: number; concurrency?: number } = {}
): Promise<number> {
  const env = getEnv();
  const rows = await getTrc20UsdtTransfers(address, {
    limit: limit ?? env.walletActivityLimit,
  });
  const enriched = await enrichTrc20TransferStatuses(rows, {
    concurrency: concurrency ?? env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });
  return sumPendingInboundUsdt(enriched);
}

export function parseTransactionFailureReason(
  info: TransactionInfo | null
): TransactionFailureReason {
  if (!info || !info.id) {
    return {
      retryable: false,
      code: "PENDING",
      feeTrx: 0,
      message: "Transaction not found",
    };
  }

  const receiptResult = info.receipt?.result || info.result;
  const feeSun =
    Number(info.fee || 0) ||
    Number(info.receipt?.energy_fee || 0) + Number(info.receipt?.net_fee || 0);
  const feeTrx = parseFloat((feeSun / 1e6).toFixed(6));

  let resMessage = "";
  if (info.resMessage) {
    resMessage = decodeTronMessage(info.resMessage);
  }

  const contractResults = info.contractResult
    ? Array.isArray(info.contractResult)
      ? info.contractResult
      : [info.contractResult]
    : [];
  let contractMessage = "";
  for (const item of contractResults) {
    const decoded = decodeTronMessage(item);
    if (decoded) {
      contractMessage = decoded;
      break;
    }
  }

  let failureMessage = resMessage;
  if (
    !failureMessage ||
    /^REVERT opcode executed$/i.test(failureMessage.trim())
  ) {
    failureMessage = contractMessage || failureMessage;
  }

  const retryable =
    receiptResult === "OUT_OF_ENERGY" ||
    /out_of_energy|not enough energy/i.test(String(failureMessage)) ||
    /out_of_energy/i.test(String(receiptResult));

  let message = retryable
    ? "Not enough TRX for network fees"
    : failureMessage || "USDT payment failed on-chain";
  if (/subtraction overflow/i.test(message)) {
    message = "Treasury USDT balance too low for this transfer";
  }

  return {
    retryable,
    code: receiptResult || "FAILED",
    feeTrx,
    message,
  };
}

export async function getTransactionFailureReason(
  txId: string
): Promise<TransactionFailureReason> {
  try {
    const info = await getTransactionInfo(txId);
    return parseTransactionFailureReason(info);
  } catch {
    return {
      retryable: false,
      code: "ERROR",
      feeTrx: 0,
      message: "Could not load transaction",
    };
  }
}

export function isRetryableFeeBroadcastError(message: unknown): boolean {
  return /insufficient|bandwidth|energy|out_of_energy|not enough energy|resource insufficient/i.test(
    String(message || "")
  );
}

export function isInsufficientTrxBalanceError(message: unknown): boolean {
  return /balance is not sufficient|insufficient balance/i.test(
    String(message || "")
  );
}

export type TrxTransferFeeEstimate = {
  estimatedTrx: number;
  estimatedTrxBase: number;
  bandwidthAvailable: number;
  txBytes: number;
};

export async function estimateTrxTransferFee(
  fromAddress: string
): Promise<TrxTransferFeeEstimate> {
  const tronWeb = await createTronWeb();
  let resources: Record<string, unknown> = {};
  try {
    resources = await runWithTronLimiter("trx.getAccountResources", () =>
      tronWeb.trx.getAccountResources(fromAddress)
    );
  } catch (err) {
    console.warn(
      "[tron] getAccountResources failed for TRX transfer fee:",
      err instanceof Error ? err.message : err
    );
    return {
      estimatedTrx: TRX_TRANSFER_FEE_FALLBACK_TRX,
      estimatedTrxBase: parseFloat(
        (TRX_TRANSFER_FEE_FALLBACK_TRX / FEE_BUFFER_RATIO).toFixed(6)
      ),
      bandwidthAvailable: 0,
      txBytes: TRX_TRANSFER_TX_BYTES,
    };
  }

  const bandwidthAvailable = getAccountBandwidthAvailable(resources);
  const bandwidthBillable = Math.max(
    0,
    TRX_TRANSFER_TX_BYTES - bandwidthAvailable
  );
  const bandwidthCostSun = bandwidthBillable * DEFAULT_BANDWIDTH_FEE_SUN;
  const estimatedTrxBase = bandwidthCostSun / TRX_SUN;
  const estimatedTrx = parseFloat(
    (estimatedTrxBase * FEE_BUFFER_RATIO).toFixed(6)
  );

  return {
    estimatedTrx,
    estimatedTrxBase: parseFloat(estimatedTrxBase.toFixed(6)),
    bandwidthAvailable,
    txBytes: TRX_TRANSFER_TX_BYTES,
  };
}

/** Admin TRX sweep: assume full tx bandwidth cost (validation ignores free bandwidth). */
export async function estimateAdminSweepTransferFee(
  fromAddress: string
): Promise<TrxTransferFeeEstimate> {
  const resourcesEstimate = await estimateTrxTransferFee(fromAddress);
  const conservativeCostSun = Math.ceil(
    TRX_TRANSFER_TX_BYTES * DEFAULT_BANDWIDTH_FEE_SUN * FEE_BUFFER_RATIO
  );
  const estimatedTrxBase = (TRX_TRANSFER_TX_BYTES * DEFAULT_BANDWIDTH_FEE_SUN) / TRX_SUN;
  const estimatedTrx = conservativeCostSun / TRX_SUN;

  return {
    estimatedTrx: parseFloat(estimatedTrx.toFixed(6)),
    estimatedTrxBase: parseFloat(estimatedTrxBase.toFixed(6)),
    bandwidthAvailable: resourcesEstimate.bandwidthAvailable,
    txBytes: TRX_TRANSFER_TX_BYTES,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTransactionConfirmation(
  txId: string,
  { timeoutMs = 60_000, pollMs = 2_000 } = {}
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getTransactionStatus(txId);
    if (status === "success") {
      return true;
    }
    if (status === "failed") {
      throw new Error("Transaction failed on-chain");
    }
    await sleep(pollMs);
  }
  return false;
}

export async function isTransactionConfirmed(txId: string): Promise<boolean> {
  return (await getTransactionStatus(txId)) === "success";
}

export async function isTransactionFailed(txId: string): Promise<boolean> {
  return (await getTransactionStatus(txId)) === "failed";
}

export async function transferTrx({
  fromPrivateKey,
  toAddress,
  amountTrx,
}: {
  fromPrivateKey: string;
  toAddress: string;
  amountTrx: number;
}): Promise<Record<string, unknown>> {
  const tronWeb = await createTronWeb(fromPrivateKey);
  const amountSun = Math.floor(Number(amountTrx) * 1e6);
  if (amountSun <= 0) {
    throw new Error("TRX transfer amount must be positive");
  }

  const result = await runWithTronLimiter("trx.sendTransaction", () =>
    tronWeb.trx.sendTransaction(toAddress, amountSun)
  );

  if (!result.result) {
    const decoded = decodeTronMessage(result.message);
    throw new Error(decoded || "Failed to broadcast TRX transfer");
  }

  const txID = result.txid || result.transaction?.txID;
  return {
    txID,
    transactionHash: txID,
    broadcast: result,
  };
}

export async function sweepTrxToTreasury({
  userPrivateKey,
  treasuryAddress,
  maxAmountTrx,
  reserveTrx = 0.1,
  trxBalanceBefore = 0,
}: {
  userPrivateKey: string;
  treasuryAddress: string;
  maxAmountTrx: number;
  reserveTrx?: number;
  trxBalanceBefore?: number;
}): Promise<Record<string, unknown> | null> {
  const fromAddress = await privateKeyToAddress(userPrivateKey);
  const currentBalance = await getTrxBalance(fromAddress);
  const recoverableAbovePrior = Math.max(
    0,
    currentBalance - Number(trxBalanceBefore) - Number(reserveTrx)
  );
  const sweepAmount = Math.min(Number(maxAmountTrx), recoverableAbovePrior);
  const rounded = parseFloat(sweepAmount.toFixed(6));

  if (rounded <= 0) {
    return null;
  }

  const transfer = await transferTrx({
    fromPrivateKey: userPrivateKey,
    toAddress: treasuryAddress,
    amountTrx: rounded,
  });

  return {
    ...transfer,
    amountTrx: rounded,
  };
}

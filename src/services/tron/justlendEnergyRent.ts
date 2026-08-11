import { getEnv } from "@/lib/env";
import {
  JUSTLEND_ENERGY_RENT_ENABLED,
  JUSTLEND_ENERGY_RENTAL_ADDRESS,
  JUSTLEND_ENERGY_WAIT_POLL_MS,
  JUSTLEND_ENERGY_WAIT_TIMEOUT_MS,
  JUSTLEND_OPENAPI_BASE,
  JUSTLEND_PREPAY_BUFFER_RATIO,
  JUSTLEND_RENT_DURATION_SECONDS,
} from "@/lib/config/justlend";
import {
  createTronWeb,
  getAccountEnergyAvailableForAddress,
  getTxId,
  isAccountActivatedOnChain,
} from "@/services/tron/client";

/** JustLend EnergyRental resourceType: 0 = bandwidth, 1 = energy. */
export const JUSTLEND_RESOURCE_BANDWIDTH = 0;
export const JUSTLEND_RESOURCE_ENERGY = 1;

const MIN_DELEGATED_TRX_SUN = BigInt(1_000_000); // 1 TRX
const MIN_LIQUIDATION_FEE_SUN = BigInt(20_000_000); // 20 TRX
const RENT_FEE_LIMIT = 200_000_000;

/** Minimal ABI for JustLend EnergyRental (Mainnet). */
const ENERGY_RENTAL_ABI = [
  {
    name: "rentResource",
    type: "function",
    stateMutability: "Payable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "resourceType", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "returnResource",
    type: "function",
    stateMutability: "Nonpayable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "resourceType", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "_rentalRate",
    type: "function",
    stateMutability: "View",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "resourceType", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRentInfo",
    type: "function",
    stateMutability: "View",
    inputs: [
      { name: "renter", type: "address" },
      { name: "receiver", type: "address" },
      { name: "resourceType", type: "uint256" },
    ],
    outputs: [
      { name: "securityDeposit", type: "uint256" },
      { name: "rentIndex", type: "uint256" },
    ],
  },
  {
    name: "rentals",
    type: "function",
    stateMutability: "View",
    inputs: [
      { name: "renter", type: "address" },
      { name: "receiver", type: "address" },
      { name: "resourceType", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "securityDeposit", type: "uint256" },
          { name: "rentIndex", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export type JustLendResourceType =
  | typeof JUSTLEND_RESOURCE_BANDWIDTH
  | typeof JUSTLEND_RESOURCE_ENERGY;

export type EnergyRentQuote = {
  targetEnergy: number;
  energyPerTrx: number;
  amountSun: bigint;
  amountTrx: number;
  rentalRate: bigint;
  durationSeconds: number;
  prepaySun: bigint;
  prepayTrx: number;
};

export type RentResourceResult = {
  txId: string;
  amountSun: string;
  prepaySun: string;
  targetEnergy: number;
  resourceType: JustLendResourceType;
};

export type ReturnResourceResult = {
  txId: string;
  amountSun: string;
};

type ContractMethod = {
  call: (...args: unknown[]) => Promise<unknown>;
  send: (options?: {
    callValue?: number | string;
    feeLimit?: number;
  }) => Promise<string | Record<string, unknown>>;
};

type EnergyRentalContract = {
  rentResource: (
    receiver: string,
    amount: string,
    resourceType: number
  ) => ContractMethod;
  returnResource: (
    receiver: string,
    amount: string,
    resourceType: number
  ) => ContractMethod;
  _rentalRate: (amount: string, resourceType: number) => ContractMethod;
  getRentInfo: (
    renter: string,
    receiver: string,
    resourceType: number
  ) => ContractMethod;
  rentals: (
    renter: string,
    receiver: string,
    resourceType: number
  ) => ContractMethod;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isJustLendEnergyRentAvailable(): boolean {
  const env = getEnv();
  return (
    env.blockchainNetwork === "mainnet" &&
    JUSTLEND_ENERGY_RENT_ENABLED &&
    Boolean(env.treasuryPrivateKey?.trim()) &&
    Boolean(JUSTLEND_ENERGY_RENTAL_ADDRESS)
  );
}

/**
 * Convert target energy units → delegated TRX sun using JustLend /lend/strx.
 * Pure helper also exported for unit tests with injected energyPerTrx.
 */
export function energyToDelegatedSun(
  targetEnergy: number,
  energyPerTrx: number
): bigint {
  if (!(targetEnergy > 0)) {
    throw new Error("targetEnergy must be positive");
  }
  if (!(energyPerTrx > 0)) {
    throw new Error("energyPerTrx must be positive");
  }
  const trxNeeded = targetEnergy / energyPerTrx;
  const sun = BigInt(Math.ceil(trxNeeded * 1_000_000));
  return sun < MIN_DELEGATED_TRX_SUN ? MIN_DELEGATED_TRX_SUN : sun;
}

/**
 * Rough prepay (JustLend formula with buffer). Unused prepaid TRX refunds on returnResource.
 */
export function computeEnergyRentPrepaySun({
  amountSun,
  rentalRate,
  durationSeconds,
  bufferRatio,
  feeSun = MIN_LIQUIDATION_FEE_SUN,
}: {
  amountSun: bigint;
  rentalRate: bigint;
  durationSeconds: number;
  bufferRatio: number;
  feeSun?: bigint;
}): bigint {
  const bufferedDuration = BigInt(
    Math.ceil((durationSeconds + 86_400) * Math.max(1, bufferRatio))
  );
  const usage =
    (amountSun * rentalRate * bufferedDuration) /
    BigInt("1000000000000000000");
  return usage + feeSun;
}

export async function fetchEnergyPerTrxFromOpenApi(): Promise<number> {
  const base = JUSTLEND_OPENAPI_BASE.replace(/\/$/, "");
  const res = await fetch(`${base}/lend/strx`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`JustLend OpenAPI /lend/strx failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: { rentInfo?: { priceFor10KEnergByStake?: number | string } };
  };
  const priceFor10k = Number(json?.data?.rentInfo?.priceFor10KEnergByStake);
  if (!(priceFor10k > 0)) {
    throw new Error("JustLend OpenAPI missing rentInfo.priceFor10KEnergByStake");
  }
  return 10_000 / priceFor10k;
}

async function getTreasuryPrivateKey(): Promise<string> {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("Treasury private key is not configured");
  }
  return pk;
}

async function getEnergyRentalContract(
  privateKey?: string
): Promise<{ contract: EnergyRentalContract; fromAddress: string }> {
  const pk = privateKey ?? (await getTreasuryPrivateKey());
  const tronWeb = await createTronWeb(pk);
  const address = JUSTLEND_ENERGY_RENTAL_ADDRESS;
  // TronWeb contract().at accepts ABI via overload or set after; use at + cast.
  const raw = (await (tronWeb as unknown as {
    contract: (abi?: unknown, addr?: string) => {
      at: (a: string) => Promise<EnergyRentalContract>;
    };
  })
    .contract(ENERGY_RENTAL_ABI, address)
    .at(address)) as EnergyRentalContract;

  return {
    contract: raw,
    fromAddress: tronWeb.defaultAddress.base58,
  };
}

function resolveSendTxId(result: string | Record<string, unknown>): string {
  if (typeof result === "string" && result.trim()) {
    return result.trim();
  }
  const fromObj = getTxId(result as Record<string, unknown>);
  if (fromObj) return fromObj;
  throw new Error("JustLend rent/return missing transaction id");
}

export async function quoteEnergyRent({
  targetEnergy,
  durationSeconds,
  resourceType = JUSTLEND_RESOURCE_ENERGY,
}: {
  targetEnergy: number;
  durationSeconds?: number;
  resourceType?: JustLendResourceType;
}): Promise<EnergyRentQuote> {
  const duration = durationSeconds ?? JUSTLEND_RENT_DURATION_SECONDS;
  const energyPerTrx = await fetchEnergyPerTrxFromOpenApi();
  const amountSun = energyToDelegatedSun(targetEnergy, energyPerTrx);

  const { contract } = await getEnergyRentalContract();
  const rateRaw = await contract
    ._rentalRate(amountSun.toString(), resourceType)
    .call();
  const rentalRate = BigInt(
    Array.isArray(rateRaw) ? String(rateRaw[0]) : String(rateRaw)
  );

  const prepaySun = computeEnergyRentPrepaySun({
    amountSun,
    rentalRate,
    durationSeconds: duration,
    bufferRatio: JUSTLEND_PREPAY_BUFFER_RATIO,
  });

  return {
    targetEnergy,
    energyPerTrx,
    amountSun,
    amountTrx: Number(amountSun) / 1e6,
    rentalRate,
    durationSeconds: duration,
    prepaySun,
    prepayTrx: Number(prepaySun) / 1e6,
  };
}

export async function rentResourceToAddress({
  receiver,
  targetEnergy,
  durationSeconds,
  resourceType = JUSTLEND_RESOURCE_ENERGY,
}: {
  receiver: string;
  targetEnergy: number;
  durationSeconds?: number;
  resourceType?: JustLendResourceType;
}): Promise<RentResourceResult> {
  if (!isJustLendEnergyRentAvailable()) {
    throw new Error("JustLend energy rent is not available on this network");
  }

  const activated = await isAccountActivatedOnChain(receiver);
  if (!activated) {
    throw new Error(
      `JustLend rent rejected: receiver ${receiver} is not activated on-chain`
    );
  }

  const quote = await quoteEnergyRent({
    targetEnergy,
    durationSeconds,
    resourceType,
  });

  // TronWeb callValue is number (sun); keep within safe integer for typical prepays.
  if (quote.prepaySun > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("JustLend prepay exceeds safe integer range");
  }

  const { contract } = await getEnergyRentalContract();
  const sendResult = await contract
    .rentResource(receiver, quote.amountSun.toString(), resourceType)
    .send({
      callValue: Number(quote.prepaySun),
      feeLimit: RENT_FEE_LIMIT,
    });

  const txId = resolveSendTxId(sendResult);
  console.log("[justlend] rentResource", {
    receiver,
    resourceType,
    amountSun: quote.amountSun.toString(),
    prepaySun: quote.prepaySun.toString(),
    targetEnergy,
    txId,
  });

  return {
    txId,
    amountSun: quote.amountSun.toString(),
    prepaySun: quote.prepaySun.toString(),
    targetEnergy,
    resourceType,
  };
}

export async function rentDelegatedTrxToAddress({
  receiver,
  amountSun,
  resourceType,
  durationSeconds,
}: {
  receiver: string;
  amountSun: bigint;
  resourceType: JustLendResourceType;
  durationSeconds?: number;
}): Promise<RentResourceResult> {
  if (!isJustLendEnergyRentAvailable()) {
    throw new Error("JustLend energy rent is not available on this network");
  }

  const activated = await isAccountActivatedOnChain(receiver);
  if (!activated) {
    throw new Error(
      `JustLend rent rejected: receiver ${receiver} is not activated on-chain`
    );
  }

  const duration = durationSeconds ?? JUSTLEND_RENT_DURATION_SECONDS;
  const delegated =
    amountSun < MIN_DELEGATED_TRX_SUN ? MIN_DELEGATED_TRX_SUN : amountSun;

  const { contract } = await getEnergyRentalContract();
  const rateRaw = await contract
    ._rentalRate(delegated.toString(), resourceType)
    .call();
  const rentalRate = BigInt(
    Array.isArray(rateRaw) ? String(rateRaw[0]) : String(rateRaw)
  );
  const prepaySun = computeEnergyRentPrepaySun({
    amountSun: delegated,
    rentalRate,
    durationSeconds: duration,
    bufferRatio: JUSTLEND_PREPAY_BUFFER_RATIO,
  });

  if (prepaySun > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("JustLend prepay exceeds safe integer range");
  }

  const sendResult = await contract
    .rentResource(receiver, delegated.toString(), resourceType)
    .send({
      callValue: Number(prepaySun),
      feeLimit: RENT_FEE_LIMIT,
    });

  const txId = resolveSendTxId(sendResult);
  return {
    txId,
    amountSun: delegated.toString(),
    prepaySun: prepaySun.toString(),
    targetEnergy: 0,
    resourceType,
  };
}

export async function returnRentedResource({
  receiver,
  amountSun,
  resourceType = JUSTLEND_RESOURCE_ENERGY,
}: {
  receiver: string;
  amountSun: string | bigint;
  resourceType?: JustLendResourceType;
}): Promise<ReturnResourceResult> {
  if (!isJustLendEnergyRentAvailable()) {
    throw new Error("JustLend energy rent is not available on this network");
  }

  const amount = typeof amountSun === "bigint" ? amountSun.toString() : amountSun;
  const { contract } = await getEnergyRentalContract();
  const sendResult = await contract
    .returnResource(receiver, amount, resourceType)
    .send({ feeLimit: RENT_FEE_LIMIT });

  const txId = resolveSendTxId(sendResult);
  console.log("[justlend] returnResource", {
    receiver,
    resourceType,
    amountSun: amount,
    txId,
  });

  return { txId, amountSun: amount };
}

export async function waitUntilEnergyAvailable({
  address,
  minEnergy,
  timeoutMs,
  pollMs,
}: {
  address: string;
  minEnergy: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<number> {
  const timeout = timeoutMs ?? JUSTLEND_ENERGY_WAIT_TIMEOUT_MS;
  const interval = pollMs ?? JUSTLEND_ENERGY_WAIT_POLL_MS;
  const started = Date.now();
  let last = 0;

  while (Date.now() - started < timeout) {
    last = await getAccountEnergyAvailableForAddress(address);
    if (last >= minEnergy) {
      return last;
    }
    await sleep(interval);
  }

  throw new Error(
    `Timed out waiting for Energy on ${address}: have ${last}, need ${minEnergy}`
  );
}

export async function getOpenRentAmountSun({
  renter,
  receiver,
  resourceType = JUSTLEND_RESOURCE_ENERGY,
}: {
  renter: string;
  receiver: string;
  resourceType?: JustLendResourceType;
}): Promise<bigint> {
  const { contract } = await getEnergyRentalContract();
  const info = await contract.rentals(renter, receiver, resourceType).call();
  if (Array.isArray(info)) {
    return BigInt(String(info[0] ?? 0));
  }
  if (info && typeof info === "object" && "amount" in info) {
    return BigInt(String((info as { amount: unknown }).amount ?? 0));
  }
  return BigInt(0);
}

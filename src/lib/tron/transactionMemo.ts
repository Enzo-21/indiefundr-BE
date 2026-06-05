import { getEnv } from "@/lib/env";

export const INDIEFUNDR_MEMO_PREFIX = "INDIEFUNDR";
export const MAX_INDIEFUNDR_MEMO_LENGTH = 120;

export type IndieFundrMemoKind =
  | "invest"
  | "redeem"
  | "topup"
  | "payout"
  | "withdraw";

export type IndieFundrMemo = {
  version: number;
  kind: IndieFundrMemoKind;
  fundId: string;
  entityId: string;
};

const KIND_VALUES: IndieFundrMemoKind[] = [
  "invest",
  "redeem",
  "topup",
  "payout",
  "withdraw",
];
const FUND_ID_PATTERN = /^[a-z0-9_-]+$/;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export function isIndieFundrChainMemoEnabled(): boolean {
  return getEnv().indieFundrChainMemoEnabled;
}

export function buildIndieFundrMemo(input: {
  kind: IndieFundrMemoKind;
  fundId: string;
  entityId: string;
  version?: number;
}): string {
  const version = input.version ?? getEnv().indieFundrChainMemoVersion;
  const fundId = input.fundId.trim().toLowerCase();
  const entityId = input.entityId.trim();

  if (!FUND_ID_PATTERN.test(fundId)) {
    throw new Error(`Invalid fundId for chain memo: ${input.fundId}`);
  }
  if (!OBJECT_ID_PATTERN.test(entityId)) {
    throw new Error(`Invalid entityId for chain memo: ${input.entityId}`);
  }
  if (!KIND_VALUES.includes(input.kind)) {
    throw new Error(`Invalid memo kind: ${input.kind}`);
  }

  const memo = `${INDIEFUNDR_MEMO_PREFIX}/${version}/${input.kind}/${fundId}/${entityId}`;
  if (memo.length > MAX_INDIEFUNDR_MEMO_LENGTH) {
    throw new Error(`Chain memo exceeds ${MAX_INDIEFUNDR_MEMO_LENGTH} characters`);
  }
  return memo;
}

export function parseIndieFundrMemo(
  raw: string | null | undefined
): IndieFundrMemo | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith(`${INDIEFUNDR_MEMO_PREFIX}/`)) {
    return null;
  }

  const parts = trimmed.split("/");
  if (parts.length !== 5) {
    return null;
  }

  const version = Number(parts[1]);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }

  const kind = parts[2] as IndieFundrMemoKind;
  if (!KIND_VALUES.includes(kind)) {
    return null;
  }

  const fundId = parts[3].toLowerCase();
  const entityId = parts[4];

  if (!FUND_ID_PATTERN.test(fundId) || !OBJECT_ID_PATTERN.test(entityId)) {
    return null;
  }

  const expectedVersion = getEnv().indieFundrChainMemoVersion;
  if (version !== expectedVersion) {
    return null;
  }

  return { version, kind, fundId, entityId };
}

export function memoFromTransactionRawData(
  dataHex: string | undefined | null
): string | null {
  if (!dataHex || typeof dataHex !== "string") {
    return null;
  }
  const hex = dataHex.replace(/^0x/i, "").trim();
  if (!hex.length || hex.length % 2 !== 0) {
    return null;
  }
  try {
    const decoded = Buffer.from(hex, "hex").toString("utf8").trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

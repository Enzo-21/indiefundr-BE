import { getEnv } from "@/lib/env";

const SHASTA_FAUCET_URL = "https://shasta.tronex.io/";
const SHASTA_TRONSCAN_URL = "https://shasta.tronscan.org";
const MAINNET_TRONSCAN_URL = "https://tronscan.org";
const TRON_ACCOUNT_DOCS_URL =
  "https://developers.tron.network/docs/account#account-activation";

export function decodeTronMessage(message: unknown): string {
  if (!message || typeof message !== "string") {
    return "";
  }
  const trimmed = message.trim();
  if (
    /^[0-9a-fA-F]+$/.test(trimmed) &&
    trimmed.length >= 8 &&
    trimmed.length % 2 === 0
  ) {
    try {
      const decoded = Buffer.from(trimmed, "hex").toString("utf8");
      if (decoded && /[\x20-\x7E]/.test(decoded)) {
        return decoded;
      }
    } catch {
      // keep raw message
    }
  }
  return trimmed;
}

function getNetworkMeta() {
  const network = getEnv().blockchainNetwork;
  const isTestnet = network === "testnet";
  return {
    network,
    isTestnet,
    faucetUrl: isTestnet ? SHASTA_FAUCET_URL : null,
    explorerUrl: isTestnet ? SHASTA_TRONSCAN_URL : MAINNET_TRONSCAN_URL,
    docsUrl: TRON_ACCOUNT_DOCS_URL,
  };
}

export type TronTransferErrorContext = {
  fromAddress?: string | null;
  trxBalance?: number;
  usdtBalance?: number;
  amountUsdt?: number;
  estimatedTrx?: number;
};

export function formatTronTransferError(
  error: unknown,
  context: TronTransferErrorContext = {}
): Record<string, unknown> {
  const { isTestnet, network, faucetUrl, explorerUrl, docsUrl } = getNetworkMeta();
  const raw = decodeTronMessage(
    error instanceof Error ? error.message : String(error)
  );
  const fromAddress = context.fromAddress || null;
  const { trxBalance, usdtBalance, amountUsdt, estimatedTrx } = context;
  const trxShortfall =
    estimatedTrx != null && trxBalance != null
      ? Math.max(0, parseFloat((estimatedTrx - trxBalance).toFixed(4)))
      : null;

  const base = {
    network,
    walletAddress: fromAddress,
    explorerAddressUrl: fromAddress
      ? `${explorerUrl}/#/address/${fromAddress}`
      : null,
    docsUrl,
    faucetUrl: isTestnet ? faucetUrl : null,
    rawMessage: raw || undefined,
  };

  const accountNotExist =
    /does not exist/i.test(raw) ||
    /account\s*\[.*\]\s*does not exist/i.test(raw);

  if (accountNotExist || (trxBalance === 0 && isTestnet)) {
    if (!(trxBalance === 0 && !accountNotExist && !isTestnet)) {
      return {
        ...base,
        code: "ACCOUNT_NOT_ACTIVATED",
        msg: isTestnet
          ? "Activate your wallet on Shasta first. Send test TRX to your wallet address, then try again."
          : "Activate your Tron wallet first. Send a small amount of TRX to your address to enable USDT transfers.",
        title: isTestnet ? "Wallet not activated (Shasta)" : "Wallet not activated",
        steps: isTestnet
          ? [
              "Open the Wallets tab and copy your main wallet address.",
              "Go to the Shasta faucet and request test TRX (and test USDT if needed).",
              "Wait about 30 seconds, then confirm TRX appears on TronScan.",
              "Return here and tap Buy again.",
            ]
          : [
              "Open the Wallets tab and copy your main wallet address.",
              "Send a small amount of TRX to that address from an exchange or wallet.",
              "Wait for confirmation, then try your purchase again.",
            ],
      };
    }
  }

  const insufficientTrx =
    trxBalance === 0 ||
    (estimatedTrx != null && trxBalance != null && trxBalance < estimatedTrx) ||
    /insufficient.*trx|bandwidth|energy|out_of_energy/i.test(raw);

  if (insufficientTrx) {
    const feeDetail =
      estimatedTrx != null
        ? ` This transfer needs about ${estimatedTrx} TRX for fees` +
          (trxBalance != null
            ? ` (you have ${trxBalance} TRX` +
              (trxShortfall && trxShortfall > 0
                ? `, short by ~${trxShortfall} TRX`
                : "") +
              ")."
            : ".")
        : "";

    return {
      ...base,
      code: "INSUFFICIENT_TRX",
      estimatedTrx: estimatedTrx ?? undefined,
      trxBalance: trxBalance ?? undefined,
      trxShortfall: trxShortfall && trxShortfall > 0 ? trxShortfall : undefined,
      msg: isTestnet
        ? "Not enough TRX for network fees. Fund your wallet with test TRX on Shasta." +
          feeDetail
        : "Not enough TRX for network fees. Add TRX to your wallet to pay for the transfer." +
          feeDetail,
      title: isTestnet ? "Need test TRX (Shasta)" : "Need TRX for fees",
      steps: isTestnet
        ? [
            "Copy your wallet address from the Wallets tab.",
            "Use the Shasta faucet to request test TRX.",
            estimatedTrx != null
              ? `Keep at least ~${estimatedTrx} TRX in your wallet for this USDT transfer.`
              : "TRX pays energy/bandwidth; USDT alone cannot cover fees.",
            "Try Buy Seed again after TRX arrives.",
          ]
        : [
            "Add TRX to your main wallet for transaction fees.",
            estimatedTrx != null
              ? `Keep at least ~${estimatedTrx} TRX for this purchase.`
              : "USDT is used for the purchase; TRX pays the network fee.",
            "Try again once your TRX balance covers the estimated fee.",
          ],
    };
  }

  if (
    amountUsdt != null &&
    usdtBalance != null &&
    usdtBalance < amountUsdt
  ) {
    return {
      ...base,
      code: "INSUFFICIENT_USDT",
      msg: isTestnet
        ? `Not enough test USDT. You need at least ${amountUsdt} USDT on Shasta.`
        : `Not enough USDT. You need at least ${amountUsdt} USDT in your main wallet.`,
      title: "Insufficient USDT",
      steps: isTestnet
        ? [
            "Open the Wallets tab and check your main wallet balance.",
            "Request test USDT from the Shasta faucet if needed.",
            `Ensure at least ${amountUsdt} USDT before buying a seed.`,
          ]
        : [
            "Deposit more USDT to your main wallet.",
            `You need at least ${amountUsdt} USDT for this purchase.`,
          ],
    };
  }

  return {
    ...base,
    code: "TRANSACTION_FAILED",
    title: "Transaction failed",
    msg:
      raw ||
      "The transaction could not be completed. Check your wallet and try again.",
    steps: isTestnet
      ? [
          "Confirm your main wallet has test TRX and test USDT on Shasta.",
          "See the Shasta faucet and TronScan links below for help.",
        ]
      : [
          "Confirm your main wallet has enough USDT and TRX.",
          "See TronScan and Tron docs below for more detail.",
        ],
  };
}

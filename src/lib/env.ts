import { z } from "zod";

const DEFAULT_MAILING_LOGO_URL =
  "https://res.cloudinary.com/vectrals-cloudinary/image/upload/v1718580949/vpass/brand/icon-192x192-bg-white_b0chyw.png";

const envFlag = (value: string | undefined, defaultEnabled = true) => {
  if (value === undefined || value === "") return defaultEnabled;
  return value !== "false";
};

const rawEnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  MONGO_URI: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default("1h"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  RESEND_API_KEY: z.string().optional(),
  MAILING_DOMAIN: z.string().default("indiefundr.com"),
  MAILING_LOGO_URL: z.string().default(DEFAULT_MAILING_LOGO_URL),
  FRONTEND_DOMAIN: z.string().default(""),
  APP_WEB_URL: z.string().default(""),
  MARKETING_DOMAIN: z.string().default(""),
  ADMIN_API_KEY: z.string().default(""),
  ADMIN_ALLOWED_EMAIL: z.string().default(""),
  BLOCKCHAIN_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  TRON_TESTNET_FULL_HOST: z
    .string()
    .default("https://api.shasta.trongrid.io"),
  TRON_MAINNET_FULL_HOST: z.string().default("https://api.trongrid.io"),
  TRON_API_KEY: z.string().default(""),
  USDT_TRC20_TESTNET_CONTRACT: z
    .string()
    .default("TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs"),
  USDT_TRC20_MAINNET_CONTRACT: z
    .string()
    .default("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
  TREASURY_ADDRESS: z.string().default(""),
  TREASURY_PRIVATE_KEY: z.string().default(""),
  FEE_SPONSORSHIP_ENABLED: z.string().optional(),
  SPONSOR_TRX_RESERVE: z.coerce.number().default(0.1),
  TREASURY_TRX_TOPUP_WAIT_MS: z.coerce.number().default(120_000),
  TREASURY_TRX_TOPUP_MAX_ROUNDS: z.coerce.number().default(5),
  FAILED_INVESTMENT_CLEANUP_LIMIT: z.coerce.number().default(50),
  WALLET_ACTIVITY_LIMIT: z.coerce.number().default(50),
  WALLET_ACTIVITY_CHAIN_LIMIT: z.coerce.number().default(30),
  WALLET_ACTIVITY_READ_MODE: z.enum(["chain", "db"]).default("db"),
  INDIEFUNDR_CHAIN_MEMO_ENABLED: z.string().optional(),
  INDIEFUNDR_CHAIN_MEMO_VERSION: z.coerce.number().default(1),
  DEFER_INVESTMENT_UNTIL_CONFIRM: z.string().optional(),
  WALLET_ACTIVITY_STATUS_CONCURRENCY: z.coerce.number().default(4),
  WALLET_BALANCE_CACHE_TTL_MS: z.coerce.number().default(30_000),
  WALLET_SYNC_BATCH_SIZE: z.coerce.number().default(20),
  WALLET_SYNC_STALE_MS: z.coerce.number().default(60_000),
  WALLET_CHAIN_SYNC_MAX_ROWS: z.coerce.number().default(2000),
  WALLET_CHAIN_SYNC_OVERLAP_MS: z.coerce.number().default(600_000),
  ADMIN_WALLET_TX_MAX: z.coerce.number().default(500),
  ADMIN_WALLET_STATS_CONCURRENCY: z.coerce.number().default(2),
  TREASURY_ACTIVITY_LIMIT: z.coerce.number().default(50),
  TREASURY_MIN_TRX_BALANCE: z.coerce.number().default(50),
  WALLET_ACTIVATION_ENABLED: z.string().optional(),
  WALLET_ACTIVATION_TRX: z.coerce.number().default(0.1),
  WALLET_ACTIVATION_CONFIRM_TIMEOUT_MS: z.coerce.number().default(90_000),
  MAX_WALLET_ACTIVATIONS_PER_DAY: z.coerce.number().default(500),
  TREASURY_ONCHAIN_DEBUG: z.string().optional(),
  TREASURY_LEDGER_DEBUG: z.string().optional(),
  PURCHASE_ORDER_TRON_DEBUG: z.string().optional(),
  TRON_HTTP_RPS_LIMIT: z.coerce.number().default(10),
  TRON_HTTP_BURST: z.coerce.number().default(2),
  TRON_HTTP_RETRY_MAX: z.coerce.number().default(3),
  TRON_HTTP_BASE_BACKOFF_MS: z.coerce.number().default(250),
  TRON_LIMITER_DIAGNOSTICS_ENABLED: z.string().optional(),
  TRON_LIMITER_LOG_LEVEL: z
    .enum(["off", "errors", "info", "debug"])
    .default("errors"),
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  REVENUE_ENGINE_ENABLED: z.string().optional(),
  INVESTMENT_AMOUNT_USDT: z.coerce.number().default(25),
  MIN_APP_MARGIN_USDT: z.coerce.number().default(40),
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT: z.coerce.number().default(10),
  PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT: z.coerce
    .number()
    .default(10 / 3),
  MIN_PLATFORM_MARGIN_PER_TRIAD_USDT: z.coerce.number().default(40),
  INVESTMENT_TERM: z.string().default(""),
  REFERRAL_INVITEE_BONUS_USDT: z.coerce.number().default(2),
  REFERRAL_INVITER_BONUS_USDT: z.coerce.number().default(2),
  REFERRAL_RECOVERY_PRINCIPAL_USDT: z.coerce.number().default(25),
  REFERRAL_RECOVERY_INVITEES_REQUIRED: z.coerce.number().default(2),
  REFERRAL_MONTHLY_SURPLUS_CAP_USDT: z.coerce.number().default(500),
  SYMPATHY_MODAL_COOLDOWN_DAYS: z.coerce.number().default(7),
});

export type Env = ReturnType<typeof buildEnv>;

function buildEnv(raw: z.infer<typeof rawEnvSchema>) {
  const databaseUrl = raw.DATABASE_URL?.trim() || raw.MONGO_URI?.trim() || "";
  const jwtAccessSecret =
    raw.JWT_ACCESS_SECRET?.trim() || raw.JWT_SECRET?.trim() || "";

  return {
    port: raw.PORT,
    databaseUrl,
    mongoUri: raw.MONGO_URI?.trim() || databaseUrl,
    jwtAccessSecret,
    jwtRefreshSecret: raw.JWT_REFRESH_SECRET?.trim() || "",
    accessTokenTtl: raw.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
    resendApiKey: raw.RESEND_API_KEY?.trim() || "",
    mailingDomain: raw.MAILING_DOMAIN,
    mailingLogoUrl: raw.MAILING_LOGO_URL,
    frontendDomain: raw.FRONTEND_DOMAIN,
    appWebUrl: raw.APP_WEB_URL?.trim() || "",
    marketingDomain: raw.MARKETING_DOMAIN?.trim() || "",
    adminApiKey: raw.ADMIN_API_KEY,
    adminAllowedEmail: raw.ADMIN_ALLOWED_EMAIL.trim().toLowerCase(),
    blockchainNetwork: raw.BLOCKCHAIN_NETWORK,
    tronTestnetFullHost: raw.TRON_TESTNET_FULL_HOST,
    tronMainnetFullHost: raw.TRON_MAINNET_FULL_HOST,
    tronApiKey: raw.TRON_API_KEY,
    usdtTrc20TestnetContract: raw.USDT_TRC20_TESTNET_CONTRACT,
    usdtTrc20MainnetContract: raw.USDT_TRC20_MAINNET_CONTRACT,
    treasuryAddress: raw.TREASURY_ADDRESS,
    treasuryPrivateKey: raw.TREASURY_PRIVATE_KEY,
    feeSponsorshipEnabled: envFlag(raw.FEE_SPONSORSHIP_ENABLED, true),
    sponsorTrxReserve: raw.SPONSOR_TRX_RESERVE,
    treasuryTrxTopUpWaitMs: raw.TREASURY_TRX_TOPUP_WAIT_MS,
    treasuryTrxTopUpMaxRounds: raw.TREASURY_TRX_TOPUP_MAX_ROUNDS,
    failedInvestmentCleanupLimit: raw.FAILED_INVESTMENT_CLEANUP_LIMIT,
    walletActivityLimit: raw.WALLET_ACTIVITY_LIMIT,
    walletActivityChainLimit: raw.WALLET_ACTIVITY_CHAIN_LIMIT,
    walletActivityReadMode: raw.WALLET_ACTIVITY_READ_MODE,
    indieFundrChainMemoEnabled: envFlag(raw.INDIEFUNDR_CHAIN_MEMO_ENABLED, true),
    indieFundrChainMemoVersion: raw.INDIEFUNDR_CHAIN_MEMO_VERSION,
    deferInvestmentUntilConfirm: envFlag(
      raw.DEFER_INVESTMENT_UNTIL_CONFIRM,
      true
    ),
    walletActivityStatusConcurrency: raw.WALLET_ACTIVITY_STATUS_CONCURRENCY,
    walletBalanceCacheTtlMs: raw.WALLET_BALANCE_CACHE_TTL_MS,
    walletSyncBatchSize: raw.WALLET_SYNC_BATCH_SIZE,
    walletSyncStaleMs: raw.WALLET_SYNC_STALE_MS,
    walletChainSyncMaxRows: raw.WALLET_CHAIN_SYNC_MAX_ROWS,
    walletChainSyncOverlapMs: raw.WALLET_CHAIN_SYNC_OVERLAP_MS,
    adminWalletTxMax: raw.ADMIN_WALLET_TX_MAX,
    adminWalletStatsConcurrency: raw.ADMIN_WALLET_STATS_CONCURRENCY,
    treasuryActivityLimit: raw.TREASURY_ACTIVITY_LIMIT,
    treasuryMinTrxBalance: raw.TREASURY_MIN_TRX_BALANCE,
    walletActivationEnabled: envFlag(raw.WALLET_ACTIVATION_ENABLED, false),
    walletActivationTrx: raw.WALLET_ACTIVATION_TRX,
    walletActivationConfirmTimeoutMs: raw.WALLET_ACTIVATION_CONFIRM_TIMEOUT_MS,
    maxWalletActivationsPerDay: raw.MAX_WALLET_ACTIVATIONS_PER_DAY,
    treasuryOnchainDebug: envFlag(raw.TREASURY_ONCHAIN_DEBUG, false),
    treasuryLedgerDebug: envFlag(raw.TREASURY_LEDGER_DEBUG, false),
    purchaseOrderTronDebug: envFlag(raw.PURCHASE_ORDER_TRON_DEBUG, false),
    tronHttpRpsLimit: raw.TRON_HTTP_RPS_LIMIT,
    tronHttpBurst: raw.TRON_HTTP_BURST,
    tronHttpRetryMax: raw.TRON_HTTP_RETRY_MAX,
    tronHttpBaseBackoffMs: raw.TRON_HTTP_BASE_BACKOFF_MS,
    tronLimiterDiagnosticsEnabled: envFlag(
      raw.TRON_LIMITER_DIAGNOSTICS_ENABLED,
      false
    ),
    tronLimiterLogLevel: raw.TRON_LIMITER_LOG_LEVEL,
    cloudinaryCloudName: raw.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: raw.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: raw.CLOUDINARY_API_SECRET,
    revenueEngineEnabled: envFlag(raw.REVENUE_ENGINE_ENABLED, true),
    investmentAmountUsdt: raw.INVESTMENT_AMOUNT_USDT,
    minAppMarginUsdt: raw.MIN_APP_MARGIN_USDT,
    appNetRevenuePerSubscriberUsdt: raw.APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
    payoutLiquidityReservePerSubscriberUsdt:
      raw.PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT,
    minPlatformMarginPerTriadUsdt: raw.MIN_PLATFORM_MARGIN_PER_TRIAD_USDT,
    investmentTerm: raw.INVESTMENT_TERM,
    referralInviteeBonusUsdt: raw.REFERRAL_INVITEE_BONUS_USDT,
    referralInviterBonusUsdt: raw.REFERRAL_INVITER_BONUS_USDT,
    referralRecoveryPrincipalUsdt: raw.REFERRAL_RECOVERY_PRINCIPAL_USDT,
    referralRecoveryInviteesRequired: raw.REFERRAL_RECOVERY_INVITEES_REQUIRED,
    referralMonthlySurplusCapUsdt: raw.REFERRAL_MONTHLY_SURPLUS_CAP_USDT,
    sympathyModalCooldownDays: raw.SYMPATHY_MODAL_COOLDOWN_DAYS,
  };
}

function parseRawEnv(source: NodeJS.ProcessEnv = process.env) {
  return rawEnvSchema.parse(source);
}

let cachedEnv: Env | null = null;

/** Clears cached env (for tests). */
export function resetEnvCache(): void {
  cachedEnv = null;
}

export function getEnv(source?: NodeJS.ProcessEnv): Env {
  if (!source && cachedEnv) return cachedEnv;
  const built = buildEnv(parseRawEnv(source ?? process.env));
  if (!source) cachedEnv = built;
  return built;
}

/** @deprecated Use getEnv() — kept for ergonomic imports */
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env];
  },
});

export function assertEnv(source?: NodeJS.ProcessEnv): Env {
  const raw = parseRawEnv(source ?? process.env);
  const built = buildEnv(raw);

  const missing: string[] = [];
  if (!built.databaseUrl) {
    missing.push("DATABASE_URL or MONGO_URI (MongoDB connection string)");
  }
  if (!built.jwtAccessSecret) {
    missing.push("JWT_ACCESS_SECRET or JWT_SECRET (JWT access signing secret)");
  }
  if (!built.jwtRefreshSecret) {
    missing.push("JWT_REFRESH_SECRET (JWT refresh signing secret)");
  }
  if (!built.resendApiKey) {
    missing.push("RESEND_API_KEY (Resend API key)");
  }

  if (missing.length > 0) {
    const lines = missing.map((label) => `  - ${label}`);
    throw new Error(
      `Missing required environment variables:\n${lines.join("\n")}\n\nCopy backend/.env.example to backend/.env and fill in the values.`
    );
  }

  return built;
}

export function warnEnv(source?: NodeJS.ProcessEnv): void {
  const e = getEnv(source);

  if (!e.treasuryAddress) {
    console.warn(
      "Warning: TREASURY_ADDRESS is not set. Wallet balances work, but buy/sell blockchain flows will fail."
    );
  }

  if (e.feeSponsorshipEnabled) {
    if (!e.treasuryPrivateKey) {
      console.warn(
        "Warning: FEE_SPONSORSHIP_ENABLED but TREASURY_PRIVATE_KEY is missing. Fund subscription fee sponsorship will fail."
      );
    } else {
      console.log(
        "Fee sponsorship enabled: users need USDT only for fund investments; treasury covers TRX network fees."
      );
    }
  }

  if (e.walletActivationEnabled) {
    if (!e.treasuryPrivateKey || !e.treasuryAddress) {
      console.warn(
        "Warning: WALLET_ACTIVATION_ENABLED but treasury is not fully configured. New wallet activation will fail."
      );
    } else {
      console.log(
        `Wallet activation enabled: treasury sends ~${e.walletActivationTrx} TRX per new main wallet (max ${e.maxWalletActivationsPerDay}/day).`
      );
    }
  }
}

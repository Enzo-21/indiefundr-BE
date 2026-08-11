/**
 * JustLend Energy Rental — Mainnet public config (not secrets).
 * Rent is only used when BLOCKCHAIN_NETWORK=mainnet and treasury PK is set.
 */
export const JUSTLEND_ENERGY_RENT_ENABLED = true;

/** Official JustLend EnergyRental contract (Mainnet). */
export const JUSTLEND_ENERGY_RENTAL_ADDRESS =
  "TU2MJ5Veik1LRAgjeSzEdvmDYx7mefJZvd";

export const JUSTLEND_OPENAPI_BASE = "https://openapi.just.network";

/** Default rental window (seconds). */
export const JUSTLEND_RENT_DURATION_SECONDS = 3600;

/** Extra prepay buffer on top of quoted rental usage. */
export const JUSTLEND_PREPAY_BUFFER_RATIO = 1.2;

export const JUSTLEND_ENERGY_WAIT_TIMEOUT_MS = 90_000;

export const JUSTLEND_ENERGY_WAIT_POLL_MS = 2_000;

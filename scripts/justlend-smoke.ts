/**
 * Live JustLend smoke: quote always; rent+return when treasury TRX covers prepay.
 *
 *   BLOCKCHAIN_NETWORK=mainnet npx dotenv -e .env.prod -- npx tsx scripts/justlend-smoke.ts
 */
import { getEnv } from "@/lib/env";
import {
  getAccountEnergyAvailableForAddress,
  getTrxBalance,
} from "@/services/tron/client";
import {
  JUSTLEND_RESOURCE_ENERGY,
  isJustLendEnergyRentAvailable,
  quoteEnergyRent,
  rentResourceToAddress,
  returnRentedResource,
  waitUntilEnergyAvailable,
} from "@/services/tron/justlendEnergyRent";

async function main() {
  const env = getEnv();
  const treasury = env.treasuryAddress?.trim();
  if (!treasury) {
    throw new Error("TREASURY_ADDRESS is not configured");
  }

  console.log("[justlend-smoke] start", {
    network: env.blockchainNetwork,
    treasury,
    available: isJustLendEnergyRentAvailable(),
  });

  if (!isJustLendEnergyRentAvailable()) {
    throw new Error(
      "JustLend unavailable (need mainnet + JUSTLEND_ENERGY_RENT_ENABLED + treasury PK)"
    );
  }

  const quote = await quoteEnergyRent({ targetEnergy: 1 });
  console.log("[justlend-smoke] QUOTE_OK", {
    amountTrx: quote.amountTrx,
    prepayTrx: quote.prepayTrx,
    rentalRate: quote.rentalRate.toString(),
  });

  const trx = await getTrxBalance(treasury);
  console.log("[justlend-smoke] treasury TRX", trx);

  if (trx < quote.prepayTrx + 0.5) {
    console.log(
      `[justlend-smoke] SKIP_RENT: need >= ${quote.prepayTrx + 0.5} TRX for liquidation reserve (have ${trx})`
    );
    console.log(
      "[justlend-smoke] binding+quote verified; fund treasury to exercise rent/return"
    );
    return;
  }

  const rented = await rentResourceToAddress({
    receiver: treasury,
    targetEnergy: 1,
    durationSeconds: 3600,
  });
  console.log("[justlend-smoke] RENT_OK", rented);

  const energy = await waitUntilEnergyAvailable({
    address: treasury,
    minEnergy: 1,
    timeoutMs: 120_000,
  });
  console.log("[justlend-smoke] ENERGY_OK", energy);

  const returned = await returnRentedResource({
    receiver: treasury,
    amountSun: rented.amountSun,
    resourceType: JUSTLEND_RESOURCE_ENERGY,
  });
  console.log("[justlend-smoke] RETURN_OK", returned);

  console.log("[justlend-smoke] done", {
    energyAfter: await getAccountEnergyAvailableForAddress(treasury),
    trxAfter: await getTrxBalance(treasury),
  });
}

main().catch((error) => {
  console.error("[justlend-smoke] failed", error);
  process.exit(1);
});

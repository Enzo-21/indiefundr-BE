import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEnergyRentPrepaySun,
  decodeUint256Hex,
  energyToDelegatedSun,
} from "./justlendEnergyRent";

describe("energyToDelegatedSun", () => {
  it("converts energy units to delegated TRX sun using energyPerTrx", () => {
    // 10 energy per TRX → 65_000 energy needs 6500 TRX → 6_500_000_000 sun
    const sun = energyToDelegatedSun(65_000, 10);
    assert.equal(sun, BigInt(6_500_000_000));
  });

  it("ceil-rounds fractional TRX and enforces minimum 1 TRX", () => {
    const tiny = energyToDelegatedSun(1, 100_000);
    assert.equal(tiny, BigInt(1_000_000));
  });

  it("rejects non-positive inputs", () => {
    assert.throws(() => energyToDelegatedSun(0, 10), /targetEnergy/);
    assert.throws(() => energyToDelegatedSun(100, 0), /energyPerTrx/);
  });
});

describe("computeEnergyRentPrepaySun", () => {
  it("includes liquidation fee reserve and duration buffer", () => {
    const amountSun = BigInt(10_000_000); // 10 TRX
    const rentalRate = BigInt(10) ** BigInt(12); // small per-second rate at 1e18 scale
    const prepay = computeEnergyRentPrepaySun({
      amountSun,
      rentalRate,
      durationSeconds: 3600,
      bufferRatio: 1.2,
      feeSun: BigInt(20_000_000),
    });
    // bufferedDuration = ceil((3600+86400)*1.2) = 108000
    // usage = 10e6 * 1e12 * 108000 / 1e18 = 1_080_000
    assert.equal(prepay, BigInt(1_080_000) + BigInt(20_000_000));
  });

  it("never drops below the fee reserve alone", () => {
    const prepay = computeEnergyRentPrepaySun({
      amountSun: BigInt(1_000_000),
      rentalRate: BigInt(0),
      durationSeconds: 1,
      bufferRatio: 1,
      feeSun: BigInt(20_000_000),
    });
    assert.equal(prepay, BigInt(20_000_000));
  });
});

describe("decodeUint256Hex", () => {
  it("decodes padded constant_result words", () => {
    assert.equal(
      decodeUint256Hex(
        "0000000000000000000000000000000000000000000000000000000191ff52bf"
      ),
      BigInt(6744396479)
    );
  });

  it("accepts 0x prefix", () => {
    assert.equal(decodeUint256Hex("0xff"), BigInt(255));
  });

  it("rejects empty or non-hex", () => {
    assert.throws(() => decodeUint256Hex(""), /Invalid uint256 hex/);
    assert.throws(() => decodeUint256Hex("zz"), /Invalid uint256 hex/);
  });
});

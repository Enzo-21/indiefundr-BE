import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure projection of estimate flags (mirrors estimateUsdtTransfer math)
 * so we can unit-test without Tron RPC.
 */
function projectZeroBurnFlags(input: {
  energyUsed: number;
  energyAvailable: number;
  txBytes: number;
  bandwidthAvailable: number;
}) {
  const energyBillable = Math.max(0, input.energyUsed - input.energyAvailable);
  const bandwidthBillable = Math.max(
    0,
    input.txBytes - input.bandwidthAvailable
  );
  const hasEnoughEnergy = energyBillable === 0;
  const hasEnoughBandwidth = bandwidthBillable === 0;
  return {
    energyBillable,
    energyShortfall: energyBillable,
    bandwidthBillable,
    bandwidthShortfall: bandwidthBillable,
    hasEnoughEnergy,
    hasEnoughBandwidth,
    canTransferZeroBurn: hasEnoughEnergy && hasEnoughBandwidth,
  };
}

describe("UsdtTransferEstimate zero-burn flags", () => {
  it("marks canTransferZeroBurn when Energy and Bandwidth cover the tx", () => {
    const flags = projectZeroBurnFlags({
      energyUsed: 65_000,
      energyAvailable: 80_000,
      txBytes: 350,
      bandwidthAvailable: 600,
    });
    assert.equal(flags.canTransferZeroBurn, true);
    assert.equal(flags.energyShortfall, 0);
    assert.equal(flags.bandwidthShortfall, 0);
  });

  it("reports energy shortfall when Energy is insufficient", () => {
    const flags = projectZeroBurnFlags({
      energyUsed: 65_000,
      energyAvailable: 10_000,
      txBytes: 350,
      bandwidthAvailable: 600,
    });
    assert.equal(flags.canTransferZeroBurn, false);
    assert.equal(flags.hasEnoughEnergy, false);
    assert.equal(flags.hasEnoughBandwidth, true);
    assert.equal(flags.energyShortfall, 55_000);
  });

  it("reports bandwidth shortfall when Bandwidth is insufficient", () => {
    const flags = projectZeroBurnFlags({
      energyUsed: 65_000,
      energyAvailable: 65_000,
      txBytes: 400,
      bandwidthAvailable: 100,
    });
    assert.equal(flags.canTransferZeroBurn, false);
    assert.equal(flags.hasEnoughBandwidth, false);
    assert.equal(flags.bandwidthShortfall, 300);
  });
});

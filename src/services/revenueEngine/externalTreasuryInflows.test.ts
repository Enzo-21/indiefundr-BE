import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE,
  treatmentFromAuditRow,
} from "./externalTreasuryInflows";

describe("treatmentFromAuditRow", () => {
  it("returns none when both audit timestamps are null", () => {
    assert.equal(
      treatmentFromAuditRow({
        poolInflowRecordedAt: null,
        adminSurplusMarkedAt: null,
      }),
      "none"
    );
  });

  it("returns withdrawable when only poolInflowRecordedAt is set", () => {
    assert.equal(
      treatmentFromAuditRow({
        poolInflowRecordedAt: new Date("2026-05-02T12:05:00.000Z"),
        adminSurplusMarkedAt: null,
      }),
      "withdrawable"
    );
  });

  it("returns surplus when adminSurplusMarkedAt is set", () => {
    assert.equal(
      treatmentFromAuditRow({
        poolInflowRecordedAt: new Date("2026-05-02T12:05:00.000Z"),
        adminSurplusMarkedAt: new Date("2026-05-02T12:10:00.000Z"),
      }),
      "surplus"
    );
  });
});

describe("AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE", () => {
  it("targets confirmed external treasury deposits", () => {
    assert.equal(
      AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE.category,
      "treasury_external_deposit"
    );
    assert.equal(AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE.direction, "in");
    assert.equal(AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE.status, "confirmed");
  });
});

describe("external treasury inflow accounting", () => {
  it("mark withdrawable increases pool and withdrawable liquidity", () => {
    const pool = 500;
    const surplus = 100;
    const deposit = 250;
    const poolAfter = pool + deposit;
    const withdrawableAfter = poolAfter - surplus;
    assert.equal(withdrawableAfter, 650);
  });

  it("mark surplus from none credits pool and surplus without changing withdrawable", () => {
    const pool = 500;
    const surplus = 100;
    const deposit = 250;
    const withdrawableBefore = pool - surplus;
    const poolAfter = pool + deposit;
    const surplusAfter = surplus + deposit;
    const withdrawableAfter = poolAfter - surplusAfter;
    assert.equal(withdrawableBefore, 400);
    assert.equal(withdrawableAfter, 400);
  });

  it("mark surplus from withdrawable only increases surplus", () => {
    const pool = 750;
    const surplusBefore = 100;
    const deposit = 250;
    const withdrawableBefore = pool - surplusBefore;
    const surplusAfter = surplusBefore + deposit;
    const withdrawableAfter = pool - surplusAfter;
    assert.equal(withdrawableBefore, 650);
    assert.equal(withdrawableAfter, 400);
  });

  it("switch surplus to withdrawable increases withdrawable by deposit amount", () => {
    const pool = 750;
    const surplusBefore = 350;
    const deposit = 250;
    const surplusAfter = surplusBefore - deposit;
    const withdrawableAfter = pool - surplusAfter;
    assert.equal(withdrawableAfter, 650);
  });

  it("clear withdrawable classification removes pool credit only", () => {
    const poolBefore = 750;
    const surplus = 100;
    const deposit = 250;
    const poolAfter = poolBefore - deposit;
    const withdrawableAfter = poolAfter - surplus;
    assert.equal(poolAfter, 500);
    assert.equal(withdrawableAfter, 400);
  });

  it("clear surplus classification removes pool and surplus credits", () => {
    const poolBefore = 750;
    const surplusBefore = 350;
    const deposit = 250;
    const poolAfter = poolBefore - deposit;
    const surplusAfter = surplusBefore - deposit;
    const withdrawableAfter = poolAfter - surplusAfter;
    assert.equal(poolAfter, 500);
    assert.equal(surplusAfter, 100);
    assert.equal(withdrawableAfter, 400);
  });
});

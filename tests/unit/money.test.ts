import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveCommissionBps, splitAmount } from "../../src/lib/payments/money";

test("komisi + hak seller selalu sama dengan harga (invarian ledger)", () => {
  let seed = 20261002;
  const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296);
  for (let i = 0; i < 5000; i++) {
    const amount = next() % 10_000_001;
    const bps = next() % 10_001;
    const { commission, earning } = splitAmount(amount, bps);
    assert.equal(commission + earning, amount);
    assert.ok(commission >= 0 && earning >= 0 && commission <= amount);
  }
});

test("pembulatan komisi ke bawah, selisih jadi milik seller", () => {
  assert.deepEqual(splitAmount(10_001, 1000), { commission: 1000, earning: 9001 });
  assert.deepEqual(splitAmount(1, 1000), { commission: 0, earning: 1 });
  assert.deepEqual(splitAmount(99, 1000), { commission: 9, earning: 90 });
});

test("batas bps: 0 persen dan 100 persen", () => {
  assert.deepEqual(splitAmount(50_000, 0), { commission: 0, earning: 50_000 });
  assert.deepEqual(splitAmount(50_000, 10_000), { commission: 50_000, earning: 0 });
  assert.deepEqual(splitAmount(0, 1000), { commission: 0, earning: 0 });
});

test("input tidak valid ditolak (pecahan, negatif, NaN, bps di luar rentang)", () => {
  for (const amount of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => splitAmount(amount, 1000), RangeError);
  }
  for (const bps of [-1, 10_001, 0.5, NaN]) {
    assert.throws(() => splitAmount(10_000, bps), RangeError);
  }
});

test("promo komisi 0 persen berlaku sampai tepat batas waktu, bukan sesudahnya", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const future = new Date("2026-10-03T00:00:00Z");
  const past = new Date("2026-10-01T00:00:00Z");
  assert.equal(effectiveCommissionBps(1000, future, now), 0);
  assert.equal(effectiveCommissionBps(1000, past, now), 1000);
  assert.equal(effectiveCommissionBps(1000, now, now), 1000);
  assert.equal(effectiveCommissionBps(1000, null, now), 1000);
});

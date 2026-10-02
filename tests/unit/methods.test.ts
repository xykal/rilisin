import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateFee, methodAllowed, PAYMENT_METHODS, paymentMethod, PRICE_LIMITS } from "../../src/lib/payments/methods";

test("QRIS: batas nominal inklusif Rp500 sampai Rp10 juta", () => {
  assert.equal(methodAllowed("qris", 499), false);
  assert.equal(methodAllowed("qris", 500), true);
  assert.equal(methodAllowed("qris", 10_000_000), true);
  assert.equal(methodAllowed("qris", 10_000_001), false);
});

test("Virtual Account: minimal Rp10 ribu, maksimal Rp50 juta", () => {
  assert.equal(methodAllowed("bri_va", 9_999), false);
  assert.equal(methodAllowed("bri_va", 10_000), true);
  assert.equal(methodAllowed("bri_va", 50_000_000), true);
  assert.equal(methodAllowed("bri_va", 50_000_001), false);
});

test("metode tak dikenal ditolak", () => {
  assert.equal(paymentMethod("bitcoin"), null);
  assert.equal(methodAllowed("bitcoin", 100_000), false);
  assert.equal(methodAllowed("__proto__", 100_000), false);
});

test("estimasi biaya QRIS 0,7 persen + Rp310 dibulatkan ke atas; VA flat", () => {
  assert.equal(estimateFee("qris", 100_000), 1010);
  assert.equal(estimateFee("qris", 10_001), 381);
  assert.equal(estimateFee("bni_va", 100_000), 3_500);
});

test("id metode unik dan harga tetap tidak lebih kecil dari minimum VA/QRIS", () => {
  const ids = PAYMENT_METHODS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(PRICE_LIMITS.fixedMin >= (paymentMethod("qris")?.min ?? Infinity));
  assert.ok(PRICE_LIMITS.max <= (paymentMethod("qris")?.max ?? 0));
});

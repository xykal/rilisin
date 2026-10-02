/**
 * Aritmatika uang murni (tanpa import) supaya bisa diuji unit tanpa database.
 * Rupiah selalu bilangan bulat; basis point (bps) 10_000 = 100%.
 */

export function effectiveCommissionBps(commissionBps: number, zeroCommissionUntil: Date | null, now = new Date()) {
  return zeroCommissionUntil && zeroCommissionUntil > now ? 0 : commissionBps;
}

/**
 * Komisi dibulatkan ke bawah (selisih pembulatan jadi milik seller).
 * Input tidak valid ditolak keras: ledger punya CHECK komisi + hak seller = harga,
 * jadi lebih baik gagal di sini daripada gagal setengah jalan di transaksi DB.
 */
export function splitAmount(amount: number, bps: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`amount tidak valid: ${amount}`);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`bps tidak valid: ${bps}`);
  const commission = Math.floor((amount * bps) / 10_000);
  return { commission, earning: amount - commission };
}

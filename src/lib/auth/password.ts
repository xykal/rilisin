import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt bawaan Node.js — tanpa dependency tambahan, tahan brute-force (memory-hard).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64url"),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Dipakai saat email tidak ditemukan, supaya waktu respons tetap mirip (anti user-enumeration). */
export async function fakePasswordCheck() {
  await scryptAsync("dummy-password", randomBytes(16), KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return false;
}

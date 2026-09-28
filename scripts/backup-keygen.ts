/**
 * Buat pasangan kunci backup (X25519).
 *   npx tsx scripts/backup-keygen.ts
 * Kunci PUBLIK → env BACKUP_PUBLIC_KEY di server (Vercel). Kunci PRIVAT → simpan di password manager / tempat aman
 * OFFLINE. Jangan taruh kunci privat di server, repo, atau chat. Tanpa kunci privat, backup tidak bisa dibuka.
 */
import { generateBackupKeyPair, keyFingerprint } from "../src/lib/backup-core";

const { publicKey, privateKey } = generateBackupKeyPair();
console.log("Sidik jari   :", keyFingerprint(publicKey));
console.log("BACKUP_PUBLIC_KEY (untuk server):");
console.log(publicKey);
console.log("\nKUNCI PRIVAT (simpan offline, JANGAN di server):");
console.log(privateKey);

import "server-only";
import { encryptBackup, exportDatabase, keyFingerprint } from "@/lib/backup-core";
import { pg } from "@/lib/db";
import { storage } from "@/lib/storage";

export const BACKUP_PREFIX = "private/backups/";
export const BACKUP_KEEP = 14;

export function backupConfigured() {
  return Boolean(process.env.BACKUP_PUBLIC_KEY?.trim());
}

/** Backup terenkripsi ke penyimpanan privat + hapus yang lebih lama dari BACKUP_KEEP file terbaru. */
export async function runBackup() {
  const publicKey = process.env.BACKUP_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error("BACKUP_PUBLIC_KEY belum diisi — backup dilewati");
  const { bundle, manifest } = await exportDatabase(pg);
  const file = encryptBackup(bundle, publicKey);
  const stamp = manifest.createdAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const key = `${BACKUP_PREFIX}rilisin-${stamp}.rlsbak`;
  await storage().write(key, file);
  const all = (await storage().list(BACKUP_PREFIX)).filter((b) => b.key.endsWith(".rlsbak")).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const removed: string[] = [];
  for (const old of all.slice(BACKUP_KEEP)) {
    await storage().remove(old.key);
    removed.push(old.key);
  }
  return {
    key,
    bytes: file.length,
    rows: manifest.tables.reduce((s, t) => s + t.rows, 0),
    tables: manifest.tables.length,
    migrations: manifest.migrations,
    fingerprint: keyFingerprint(publicKey),
    removed: removed.length,
  };
}

export async function listBackups() {
  if (!backupConfigured()) return [];
  try {
    return (await storage().list(BACKUP_PREFIX)).filter((b) => b.key.endsWith(".rlsbak")).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  } catch {
    return [];
  }
}

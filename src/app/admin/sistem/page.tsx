import { Archive, CheckCircle2, CircleAlert, Clock, Download, HardDrive, Play, ShieldCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { runMaintenanceNowAction } from "@/app/actions/system";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { backupConfigured, listBackups } from "@/lib/backup";
import { keyFingerprint } from "@/lib/backup-core";
import { emailConfigured } from "@/lib/email";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { lastJobs } from "@/lib/maintenance";
import { requireCleanScan, scanStats, scanWorkerToken, workerStatus } from "@/lib/scan";
import { turnstileConfig } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Sistem" };

function Check({ ok, warn, label, children }: { ok: boolean; warn?: boolean; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : warn ? (
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <p className="font-semibold text-ink">{label}</p>
        {children && <div className="text-sm text-slate-500">{children}</div>}
      </div>
    </li>
  );
}

export default async function SystemPage() {
  await requireAdmin("/admin/sistem");
  const [jobs, backups, scan, worker] = await Promise.all([lastJobs(), listBackups(), scanStats(), workerStatus()]);
  const ts = turnstileConfig();
  const pubKey = process.env.BACKUP_PUBLIC_KEY?.trim();
  const workerSeen = worker.seen;
  const workerAlive = worker.alive;
  const clean = jobs.pembersihan;
  const bak = jobs.backup;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Admin</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sistem</h1>
          <p className="mt-1 text-sm text-slate-500">Backup, pembersihan data, antivirus, dan pengaman anti-bot. Tugas harian berjalan otomatis sekitar pukul 02.00 WIB.</p>
        </div>
        <form action={runMaintenanceNowAction}>
          <SubmitButton pendingText="Menjalankan…" confirm="Jalankan pembersihan + backup sekarang?">
            <Play className="h-4 w-4" /> Jalankan sekarang
          </SubmitButton>
        </form>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <ShieldCheck className="h-5 w-5 text-brand-600" /> Status pengaman
          </h2>
          <ul className="mt-2 divide-y divide-slate-100">
            <Check ok={backupConfigured()} label="Backup terenkripsi">
              {pubKey ? <>Kunci publik <code className="font-mono text-xs">{keyFingerprint(pubKey)}</code> · kunci privat dipegang pemilik (tidak ada di server)</> : "BACKUP_PUBLIC_KEY belum diisi — backup harian dilewati."}
            </Check>
            <Check ok={Boolean(process.env.CRON_SECRET)} label="Tugas harian terjadwal (Vercel Cron)">
              {process.env.CRON_SECRET ? "Aktif, dilindungi CRON_SECRET." : "CRON_SECRET belum diisi — cron tidak bisa berjalan."}
            </Check>
            <Check ok={Boolean(scanWorkerToken()) && workerAlive} warn={Boolean(scanWorkerToken()) && !workerAlive} label="Worker antivirus (ClamAV)">
              {!scanWorkerToken()
                ? "SCAN_WORKER_TOKEN belum diisi."
                : workerSeen
                  ? `Terakhir terlihat ${timeAgo(workerSeen)} · ${worker.engine}`
                  : "Token siap, tapi worker belum pernah terhubung. Jalankan scanner/ (Docker) di server mana pun."}
            </Check>
            <Check ok={requireCleanScan()} warn={!requireCleanScan()} label="Wajib lolos antivirus sebelum diunduh">
              {requireCleanScan() ? "Aktif — file yang belum dipindai tidak bisa diunduh publik." : "Belum aktif (REQUIRE_CLEAN_SCAN=1 setelah worker berjalan). File terinfeksi tetap selalu diblokir."}
            </Check>
            <Check ok={Boolean(ts) && ts?.mode === "strict"} warn={ts?.mode === "soft"} label="Cloudflare Turnstile (anti-bot)">
              {!ts ? "Belum dikonfigurasi." : ts.mode === "soft" ? "Mode lunak (staging terkunci): token diverifikasi kalau ada." : "Mode ketat: daftar, lupa password, dan login setelah 3× gagal."}
            </Check>
            <Check ok label="Rate limit bersama antar server">Hitungan disimpan di database (UNLOGGED), konsisten walau banyak instance.</Check>
            <Check ok={emailConfigured()} warn={!emailConfigured()} label="Email (Resend)">
              {emailConfigured() ? "Aktif." : "Belum aktif — email hanya dicatat di log."}
            </Check>
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Clock className="h-5 w-5 text-brand-600" /> Tugas harian terakhir
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pembersihan</p>
                {clean ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
                      {clean.ok ? <Badge tone="green">Berhasil</Badge> : <Badge tone="red">Gagal</Badge>} {timeAgo(clean.startedAt)}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {Object.entries(clean.details ?? {}).map(([k, v]) => (
                        <li key={k} className="flex justify-between gap-2">
                          <span>{k}</span>
                          <span className="font-mono">{String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Belum pernah berjalan.</p>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Backup</p>
                {bak ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
                      {bak.ok ? <Badge tone="green">Berhasil</Badge> : <Badge tone="red">Gagal</Badge>} {timeAgo(bak.startedAt)}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      {bak.ok
                        ? `${formatBytes(Number(bak.details?.bytes ?? 0))} · ${String(bak.details?.rows ?? 0)} baris · ${String(bak.details?.tables ?? 0)} tabel`
                        : String(bak.details?.error ?? "")}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Belum pernah berjalan.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <HardDrive className="h-5 w-5 text-brand-600" /> Antivirus
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Menunggu", scan.pending, "text-amber-600"],
                ["Bersih", scan.clean, "text-emerald-600"],
                ["Malware", scan.infected, "text-red-600"],
                ["Gagal", scan.error, "text-slate-600"],
              ].map(([label, n, tone]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className={`text-2xl font-extrabold ${tone}`}>{String(n)}</p>
                  <p className="text-xs text-slate-500">{String(label)}</p>
                </div>
              ))}
            </div>
            {scan.oldest && <p className="mt-3 text-xs text-slate-500">File tertua yang menunggu: {timeAgo(scan.oldest)}</p>}
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Archive className="h-5 w-5 text-brand-600" /> File backup ({backups.length})
        </h2>
        <p className="mt-1 text-sm text-slate-500">Disimpan terenkripsi di penyimpanan privat, 14 terbaru dipertahankan. Unduh sesekali untuk salinan di luar Vercel.</p>
        {backups.length ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {backups.map((b) => (
              <li key={b.key} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{b.key.split("/").pop()}</span>
                <span className="text-xs text-slate-500">{formatBytes(b.size)}</span>
                <span className="text-xs text-slate-500" title={formatDateTime(b.uploadedAt)}>
                  {timeAgo(b.uploadedAt)}
                </span>
                <a href={`/admin/sistem/unduh?key=${encodeURIComponent(b.key)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  <Download className="h-3.5 w-3.5" /> Unduh
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada backup.</p>
        )}
      </Card>

      <Card className="mt-6 overflow-hidden">
        <h2 className="p-6 pb-3 text-lg font-bold text-ink">Riwayat tugas</h2>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-2">Tugas</th>
                <th className="px-3 py-2">Mulai</th>
                <th className="px-3 py-2">Durasi</th>
                <th className="px-6 py-2">Hasil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.rows.map((j) => (
                <tr key={j.id}>
                  <td className="px-6 py-2 font-semibold text-ink">{j.job}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDateTime(j.startedAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{j.finishedAt ? `${((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000).toFixed(1)} dtk` : "…"}</td>
                  <td className="px-6 py-2">{j.ok === null ? <Badge>Berjalan</Badge> : j.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">Gagal</Badge>}</td>
                </tr>
              ))}
              {!jobs.rows.length && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-slate-500">
                    Belum ada riwayat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

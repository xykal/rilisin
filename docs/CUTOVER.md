# Cutover produksi Rilisin (runbook)

Status: DRAF, 2026-09-29. Staging (`rilisin.xyverse.my.id`, site-lock) TETAP jalan
sebagai cermin uji — produksi = proyek Vercel + database Neon + Blob store
TERPISAH. Repo tetap publik; semua rahasia di env Vercel / GitHub Environments,
tidak pernah di repo/chat.

Prinsip:

- Deploy produksi HANYA via CI manual (`workflow_dispatch` → job `deploy-prod`),
  tidak pernah auto-deploy dari push. Jangan hubungkan proyek Vercel produksi ke
  GitHub auto-deploy (atau matikan production branch-nya).

> **Tanpa anggaran?** Jalur ini butuh ±$35–50/bln. Jalur $0/bulan (Docker di
> VPS gratis Oracle / Hetzner murah, kode sama): **`docs/SELFHOST.md`**.
- Data produksi = data asli. Seed/smoke menambah data → hanya dengan akun uji
  bernama jelas, lalu bersihkan (Fase 2).
- Migrasi: skema harus backward-compatible (kode lama + skema baru harus tetap
  jalan) supaya rollback app tidak butuh rollback DB.

## Fase 0 — Keputusan & akun (kall)

| # | Tugas | Catatan |
|---|-------|---------|
| 0.1 | Pilih domain produksi | Cek ketersediaan + merek di DJKI (contoh di docs: `rilisin.id`) |
| 0.2 | Vercel Pro | Hobby dilarang untuk komersial (lihat README). Staging boleh tetap Hobby |
| 0.3 | Akun Neon | Proyek database TERPISAH untuk produksi (jangan branch dari staging) |
| 0.4 | Cloudflare | Widget Turnstile produksi (domain = domain prod). R2 opsional (nanti, kalau egress Blob mahal) |
| 0.5 | Resend | Verifikasi domain pengirim (untuk `EMAIL_FROM`) + API key produksi |
| 0.6 | Pakasir | Proyek BARU "rilisin" + KYC akun & proyek untuk go-live (sandbox dulu boleh) |
| 0.7 | Google Cloud | OAuth client ID produksi (Web) + Authorized redirect URI `https://DOMAIN/api/auth/google/callback` |
| 0.8 | GitHub | Environment `production`: protection (required reviewers) + vars & secrets (Fase 1) |
| 0.9 | Budget alert | Vercel, Neon, Resend, Cloudflare — pasang sebelum go-live |

Dilewati dengan sadar: Upstash Redis (rate limit bersama sudah lewat Postgres),
OneSignal push (belum diimplementasi), R2 (migrasi nanti kalau perlu).

### Estimasi biaya bulanan awal (cek 2026-09-29, bisa berubah)

| Layanan | Paket | Estimasi |
|---|---|---|
| Vercel | Pro 1 seat — WAJIB untuk komersial (Hobby melarang komersial, risiko suspend) | $20/bln (termasuk kredit usage $20) |
| Neon (DB prod) | Launch usage-based (Free tidak cocok: tidur otomatis + storage 0.5 GB) | ~$15/bln |
| Resend | Free tier cukup untuk awal (verifikasi + struk volume kecil) | $0 |
| Turnstile | Gratis | $0 |
| Pakasir | Potongan per transaksi (cek dashboard Pakasir) | variabel |
| Blob (gambar + file) | Termasuk kuota Vercel, lebihnya usage | kecil di awal |

Total tetap awal: ±$35–50/bln (sekitar Rp600–800rb). Staging tetap $0
(Hobby + Neon Free = pemakaian dev, bukan komersial — legal).

## Fase 1 — Proyek & env (±1 hari)

1. Buat proyek Vercel `rilisin-prod`: region `sin1`, framework Next.js, cron
   `/api/cron/harian` ikut dari `vercel.json`. JANGAN aktifkan Git Deploy.
2. Buat proyek Neon produksi. Catat pooler + unpooled connection string.
3. Buat 2 Blob store produksi: publik (gambar) + privat (file). Hubungkan ke
   proyek Vercel (prefix env `FILES_` untuk store privat).
4. Isi env produksi (Lampiran A). Aturan rotasi: SEMUA secret kecuali kunci
   publik backup HARUS baru (jangan salin dari staging). Kunci backup: keypair
   baru via `npm run backup:keygen`, privat disimpan offline.
5. GitHub → Settings → Environments → `production`: protection + vars
   (`VERCEL_PROD_ORG_ID`, `VERCEL_PROD_PROJECT_ID`, `PROD_URL`) + secrets
   (`VERCEL_TOKEN`, `SCAN_WORKER_TOKEN_PROD`).
6. Verifikasi konfigurasi (tanpa deploy): dispatch `Scan produksi (ClamAV)` →
   harus gagal dengan pesan prasyarat yang jelas (bukan error misterius).

## Fase 2 — Deploy pertama tertutup + smoke

1. Actions → CI → Run workflow (branch `main`) → job `deploy-prod` jalan
   sesudah `test` + `security` hijau.
2. Cek build log deployment: baris `Migrasi database via koneksi langsung…` +
   `✓ Migrasi database selesai` harus ada (auto-migrate).
3. Smoke ke produksi (menambah data!):
   ```bash
   SMOKE_DEMO_PASSWORD='<acak>' node scripts/smoke-test.mjs https://DOMAIN
   ```
   Tanpa `SMOKE_BASIC_AUTH` (produksi tidak dikunci). Sesudah hijau: hapus
   produk uji via UI seller + nonaktifkan/ban akun uji (`ujiprod…`).
4. Verifikasi operasional: cron harian pertama jalan (cek `/admin` log atau
   tabel backup), file `.rlsbak` muncul di Blob privat, 1 email terkirim
   (daftar akun asli), Turnstile STRICT (token dummy harus GAGAL),
   dispatch `Scan produksi` manual → antrean terkuras, `REQUIRE_CLEAN_SCAN=1`
   dinyalakan sesudah worker terbukti jalan.

## Fase 3 — Go-live (DNS + gateway)

1. Domain → Vercel (A/CNAME sesuai dashboard). Set `APP_URL` +
   `ALLOWED_ORIGINS` ke domain produksi → redeploy.
2. Google: redirect URI produksi terdaftar; tombol Google di `/masuk` diklik
   manual (1 akun asli).
3. Pakasir: Webhook URL `https://DOMAIN/api/payments/pakasir/webhook` diisi di
   proyek; `PAKASIR_ALLOW_SANDBOX=0` HANYA sesudah KYC live.
4. Kunci pengaman (cek via API, bukan dashboard): `SITE_LOCK_*`, `SEED_*`,
   `SMOKE_*`, `ALLOW_SEED`, `GOOGLE_*_URL`, `PAKASIR_BASE_URL` TIDAK ADA di env
   produksi; `REQUIRE_STAFF_2FA=1`; `FRAME_ANCESTORS` kosong (= `'none'`).
5. Gerbang konten (ROADMAP 2026-11-02): placeholder legal (`[NAMA ENTITAS]` dkk
   di `docs/legal/`) sudah diisi + direview, `npm run legal:sync`, support live.
6. Umumkan. Pantau log 24 jam pertama.

## Fase 4 — Pasca (7 hari)

- Nyalakan `schedule` di `.github/workflows/scan-prod.yml` (buka komentar).
- Drill restore: pulihkan 1 backup produksi ke database STAGING
  (`RESTORE_ALLOW_REMOTE=hapus-semua-data` + kunci privat offline) → bukti backup
  bisa dipakai, tanpa menyentuh prod.
- Rotasi secret pertama terjadwal (kalender 90 hari): `APP_SECRET`,
  `SCAN_WORKER_TOKEN`, `CRON_SECRET`, `PAKASIR_*`, `RESEND_API_KEY`.
- Review temuan ZAP/CodeQL mingguan; ulangi smoke tiap rilis besar.

## Rollback

- App: Vercel → Deployments → pilih deployment sehat → Promote (instan).
- DB: Neon restore/branch dari history — VERIFIKASI retensi paket yang dipakai
  SEBELUM go-live (jangan asumsi). Uji restore ke branch di Fase 2.
- Kalau rollback app tanpa rollback DB: pastikan migrasi terakhir
  backward-compatible (aturan prinsip di atas).

## Lampiran A — Env produksi (checklist nama saja, tanpa nilai)

Legenda: W = wajib, O = opsional, A = otomatis via integrasi, X = DILARANG di prod.

| Var | | Sumber |
|---|---|---|
| `APP_SECRET` | W (baru!) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | W | `https://DOMAIN` |
| `ALLOWED_ORIGINS` | W | domain prod (tanpa `*.e2b.app`) |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | W | integrasi Neon proyek prod |
| `PG*`, `POSTGRES_*`, `NEON_*` | A | integrasi Neon/Vercel |
| `BLOB_READ_WRITE_TOKEN`, `FILES_READ_WRITE_TOKEN` | W | 2 Blob store prod |
| `STORAGE_DRIVER` | W | `vercel-blob` |
| `BACKUP_PUBLIC_KEY` | W (keypair baru!) | `npm run backup:keygen` |
| `CRON_SECRET` | W (baru!) | acak ≥16 karakter |
| `EMAIL_FROM`, `RESEND_API_KEY` | W | Resend domain terverifikasi |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | W | OAuth client prod (Google Cloud) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | W | widget Turnstile prod; `TURNSTILE_MODE` kosong (= strict) |
| `PAYMENT_PROVIDER` | W | `pakasir` |
| `PAKASIR_SLUG`, `PAKASIR_API_KEY`, `PAKASIR_WEBHOOK_SECRET` | W | proyek Pakasir prod |
| `PAKASIR_ALLOW_SANDBOX` | W | `0` (live) — `1` hanya selama uji sandbox |
| `PAYMENT_HOLD_DAYS`, `PAYOUT_MIN_IDR` | W | `7`, `50000` |
| `SCAN_WORKER_TOKEN` | W (baru!) | acak ≥32 karakter (= `SCAN_WORKER_TOKEN_PROD` di GitHub) |
| `SCAN_WORKER_TTL_MIN` | W | `90` (worker per jam) |
| `REQUIRE_CLEAN_SCAN` | W* | `1`, sesudah worker prod terbukti jalan |
| `REQUIRE_STAFF_2FA` | W | `1` |
| `TRUSTED_PROXY_HOPS` | W | `1` |
| `SSE_MAX_SECONDS` | W | `280` |
| `MAX_RELEASE_FILE_MB` | W | `100` |
| `NEXT_TELEMETRY_DISABLED` | O | `1` |
| `FRAME_ANCESTORS`, `DATABASE_URL_DIRECT` | O | kosongkan |
| `SITE_LOCK_USER`, `SITE_LOCK_PASSWORD` | X | staging saja |
| `SEED_ALLOW_REMOTE`, `SEED_DEMO_PASSWORD`, `ALLOW_SEED` | X | tidak pernah di prod |
| `SMOKE_BASIC_AUTH`, `SMOKE_DEMO_PASSWORD`, `DEMO_PASSWORD_HINT` | X | staging/CI saja |
| `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_USERINFO_URL` | X | CI saja (OAuth palsu) |
| `PAKASIR_BASE_URL` | X | override uji saja |
| ` BACKUP_PRIVATE_KEY`, `RESTORE_ALLOW_REMOTE` | X | mesin operator saja, tidak di Vercel |

## Lampiran B — Verifikasi cepat pasca-deploy

```bash
BASE=https://DOMAIN
curl -s -o /dev/null -w 'beranda: %{http_code}\n' $BASE/
curl -s $BASE/masuk | grep -c 'Lanjutkan dengan Google'   # 1 = env Google kebaca
for p in ketentuan privasi kuki aup refund; do
  curl -s -o /dev/null -w "$p: %{http_code}\n" $BASE/$p
done
curl -s -o /dev/null -w 'security.txt: %{http_code}\n' $BASE/.well-known/security.txt
```

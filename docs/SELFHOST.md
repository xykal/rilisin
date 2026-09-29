# Self-host Rilisin: produksi $0/bulan (Docker di VPS)

Jalur ini untuk masa awal tanpa anggaran: seluruh aplikasi (app + Postgres +
antivirus + HTTPS) jalan di SATU VPS gratis/termurah. Kode SAMA dengan yang di
Vercel — beda tempat & cara deploy saja. Pindah ke Vercel Pro nanti gampang
(env-nya sudah terpisah rapi).

## Biaya jujur

| Komponen | $0 pakai | Catatan |
|---|---|---|
| VPS | Oracle Always Free (ARM Ampere, 2 OCPU/12 GB, 200 GB, 10 TB egress) | Butuh kartu (debit/CC) untuk VERIFIKASI, tidak dicharge. Cadangan: Hetzner CX22 ±€4/bln |
| Domain | ~$10–15/TAHUN (`.com`/`.id`) | Satu-satunya biaya wajib. Sementara setup boleh subdomain gratisan |
| Postgres | Docker di VPS yang sama | Pengganti Neon (tidur + 0.5 GB tidak cocok untuk prod) |
| File + backup | Disk VPS (`STORAGE_DRIVER=local`) | `.rlsbak` + upload di volume `appdata` — salin keluar VPS berkala |
| Email | Resend free tier | Cukup untuk verifikasi + struk awal |
| Captcha | Turnstile | Gratis |
| HTTPS | Caddy (Let's Encrypt) | Gratis, otomatis |
| Pembayaran | Pakasir sandbox → live | Tanpa biaya bulanan; potongan per transaksi + KYC gratis |

Total tetap: **$0/bln + domain**. Risiko Oracle yang wajib diketahui: akun
kadang lama di-approve, dan VPS yang SEPI TOTAL berminggu-minggu bisa dihentikan
(idle reclamation). Marketplace aktif + cron harian = tidak idle = aman. Jaring
pengaman: backup terenkripsi `.rlsbak` (pulihkan di mana saja).

## Arsitektur (docker-compose.yml)

`caddy (80/443)` → `app:3000` → `db`, `clamd`+`scanner` internal.
Tiap `compose up --build`: `migrate` jalan dulu (gagal = app tidak nyala —
sama seperti auto-migrate di Vercel). Port 3000 hanya localhost (cron host).

## Setup Oracle (sekali saja, ±1 jam + tunggu approve)

1. Daftar cloud.oracle.com (kartu untuk verifikasi). Pilih home region yang
   ada kapasitas ARM (coba Singapore/Japan; kalau penuh, ganti region).
2. Compartment → VCN Wizard (public subnet). Security List: buka ingress
   `80/tcp`, `443/tcp` dari `0.0.0.0/0`, dan `22/tcp` HANYA dari IP kamu.
3. Compute → Create instance: image **Ubuntu 24.04 minimal (aarch64)**,
   shape **VM.Standard.A1.Flex, 2 OCPU / 12 GB**, boot volume 100 GB.
   Simpan private key SSH (`.pem`, `chmod 400`). Assign **reserved public IP**.
4. SSH masuk, instal Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   docker compose version  # harus ada (plugin compose)
   ```
5. Firewall host: `sudo ufw allow 22,80,443/tcp && sudo ufw enable`.
6. Clone repo (HTTPS + token, atau deploy key read-only):
   ```bash
   git clone https://github.com/xykal/rilisin.git && cd rilisin
   ```

## Konfigurasi & deploy pertama

1. `.env` (untuk Compose/Caddy):
   ```bash
   DOMAIN=domainmu.id
   ```
2. `.env.prod` (untuk app/db/scanner) — salin dari `.env.example`, lalu sesuaikan:
   ```bash
   cp .env.example .env.prod
   ```
   Wajib benar: `DATABASE_URL=postgres://rilisin:<POSTGRES_PASSWORD>@db:5432/rilisin`
   (host `db` = nama service!), `POSTGRES_PASSWORD=<acak-kuat>`, `APP_SECRET`,
   `APP_URL=https://DOMAIN`, `ALLOWED_ORIGINS=DOMAIN`, `STORAGE_DRIVER=local`,
   `STORAGE_LOCAL_DIR=/app/data/storage`, `CRON_SECRET`, `SCAN_WORKER_TOKEN`,
   `BACKUP_PUBLIC_KEY` (keypair baru!), `EMAIL_FROM` + `RESEND_API_KEY`,
   `GOOGLE_CLIENT_ID/SECRET` (redirect URI = APP_URL), `TURNSTILE_*`,
   `REQUIRE_STAFF_2FA=1`, `TRUSTED_PROXY_HOPS=1`, `PAYMENT_PROVIDER=pakasir`,
   `PAKASIR_*`, `PAKASIR_ALLOW_SANDBOX=1` (0 setelah KYC live).
   DILARANG di prod: `SITE_LOCK_*`, `SEED_*`, `SMOKE_*`, `ALLOW_SEED`,
   `GOOGLE_*_URL`, `PAKASIR_BASE_URL`. (Daftar lengkap: CUTOVER.md Lampiran A.)
3. DNS: A record `DOMAIN` → IP VPS (Cloudflare free boleh, proxied on/off bebas).
4. Nyalakan:
   ```bash
   docker compose up -d --build
   docker compose logs -f migrate  # harus berakhir "Migrasi database selesai"
   ```
   Unduhan pertama ClamAV ±2–3 menit; sertifikat HTTPS terbit setelah DNS aktif.
5. Verifikasi: perintah di CUTOVER.md Lampiran B (ganti BASE), lalu smoke test:
   ```bash
   SMOKE_DEMO_PASSWORD='<acak>' node scripts/smoke-test.mjs https://DOMAIN
   ```
   Sesudah hijau: hapus produk/akun uji (`ujiprod…`).

## Operasi harian

- Cron host (cron harian app; worker antivirus sudah daemon):
  ```bash
  0 19 * * * . $HOME/rilisin/.env.prod && curl -sf -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/harian
  ```
  (`.env.prod` tidak di-echo; cron mail dimatikan: `>/dev/null 2>&1`.)
- Deploy update: `git pull && docker compose up -d --build` (migrasi otomatis).
- Log: `docker compose logs -f app` / `docker compose logs -f scanner`.
- Backup off-site: salin `appdata` (`.rlsbak`) keluar VPS berkala
  (rclone ke Backblaze B2 free 10 GB, atau `scp` ke laptop + kunci privat offline).
- Drill restore: pulihkan 1 backup ke database STAGING (jangan prod).
- Update: `docker compose pull clamd` berkala (signature ikut image) +
  `apt upgrade` host bulanan.

## Rollback & batasan

- Rollback app: `git checkout <commit-sehat> && docker compose up -d --build`.
  Backup DB dulu (`docker compose exec db pg_dump ...`) kalau ragu.
- Batasan jujur: satu VPS = satu titik gagal; scale vertikal dulu (resize
  shape); kalau trafik/budget naik → pindah ke `docs/CUTOVER.md` (Vercel Pro +
  Neon) tanpa ubah kode.

## Alternatif

- **Coolify** (self-hosted PaaS, gratis, di VPS yang sama): UI + auto-deploy
  dari GitHub. Enak kalau malas SSH; makan RAM ±2 GB. Compose di repo ini
  tetap bisa dipakai sebagai referensi env.
- **Hetzner CX22** (±€4/bln, Falkenstein/Nuremberg): kalau Oracle gagal approve.
  Langkah sama persis dari "SSH masuk" (Debian/Ubuntu).

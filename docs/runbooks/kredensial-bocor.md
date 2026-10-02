# Runbook — kredensial bocor atau tertempel di tempat yang salah

Pemicu: key/token tampil di chat, log, screenshot, issue, atau commit. Anggap sudah
dipakai pihak lain. Cabut dulu, selidiki sesudahnya.

## Urutan (paling berisiko dulu)
1. Pakasir (uang): buat ulang API key di dashboard Pakasir, update env Vercel
   `PAKASIR_API_KEY` dan webhook secret, deploy ulang. Cek halaman admin keuangan untuk
   transaksi atau pencairan yang tidak dikenal.
2. GitHub PAT: Settings > Developer settings > Tokens > Revoke. Buat baru dengan scope
   `repo` + `workflow`, kedaluwarsa <= 30 hari. Cek Settings > Security log untuk aktivitas asing.
3. Vercel token dan Cloudflare API token: revoke di dashboard, buat baru dengan scope
   per proyek/zona. Tinjau Audit Log masing-masing.
4. Tailscale auth key: revoke di Admin console > Keys; periksa daftar mesin.
5. Google OAuth client secret (`rilisin_web`): reset secret di Google Cloud Console,
   update `GOOGLE_CLIENT_SECRET` di Vercel.
6. Cloudinary API secret, Resend, OneSignal, Groq: regenerate di dashboard, update env.
7. Rahasia aplikasi di Vercel (`APP_SECRET`, `CRON_SECRET`, `SCAN_WORKER_TOKEN`) hanya
   diganti kalau ikut bocor; mengganti `APP_SECRET` meng-invalidate sesi dan secret 2FA
   terenkripsi, jadi rencanakan migrasi dulu.

## Sesudahnya
- Simpan kredensial hanya di secret manager atau env Vercel/GitHub Secrets; jangan
  di file yang di-upload ke alat apa pun.
- Cek scan secret: `git grep -nE '(ghp_|gsk_|GOCSPX-|cfut_|tskey-|vcp_)' $(git rev-list --all)`.
- Catat kejadian dan tanggal rotasi di `PROGRESS.md`.

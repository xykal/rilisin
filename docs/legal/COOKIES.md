# Kebijakan Cookie — Rilisin

**DRAFT — review oleh pengacara berlisensi sebelum dipublikasikan.**
Versi 1.0-draft · Disusun 2026-09-28 · Berlaku sejak: [TANGGAL BERLAKU]

Daftar di bawah diambil dari kode aplikasi (`src/lib/auth/session.ts`,
`src/lib/auth/mfa.ts`, `src/lib/auth/password-reset.ts`,
`src/lib/auth/email-verification.ts`, `src/lib/auth/oauth.ts`) — bukan contoh generik.

## Cookie yang Kami pasang

| Nama | Masa | Fungsi | Jenis |
|---|---|---|---|
| `rilisin_session` / `__Host-rilisin_session` | 30 hari | Menjaga status login | Wajib fungsi |
| `rilisin_mfa` / `__Host-rilisin_mfa` | 10 menit | Tantangan verifikasi 2FA | Wajib fungsi |
| `rilisin_reset` / `__Secure-rilisin_reset` | 30 menit | Token reset password (hanya berlaku di halaman `/atur-ulang-password`) | Wajib fungsi |
| `rilisin_verify` / `__Secure-rilisin_verify` | 24 jam | Token verifikasi email (hanya berlaku di halaman `/verifikasi-email`) | Wajib fungsi |
| `rilisin_oauth` / `__Secure-rilisin_oauth` | 10 menit | Tiket login Google: `state` acak + PKCE verifier, sekali pakai | Wajib fungsi |

Semua cookie di atas **HttpOnly** (tidak bisa dibaca JavaScript). Di HTTPS,
cookie session memakai prefix `__Host-` + `Secure` + `SameSite=None;
Partitioned` (supaya login tetap bekerja saat Platform dibuka di dalam iframe
preview); di HTTP memakai `SameSite=Lax`. Perlindungan CSRF tetap berlaku karena
setiap request yang mengubah data memeriksa header Origin.

## Cookie pihak ketiga

- **Cloudflare Turnstile** (anti-bot) dapat memasang cookie di domain
  `challenges.cloudflare.com` saat tantangan ditampilkan. Turnstile hanya aktif
  setelah beberapa kali percobaan gagal dari satu jaringan.
- Tidak ada cookie iklan, analitik pelacakan lintas situs, atau piksel media sosial.

## Mengelola cookie

Anda bisa memblokir atau menghapus cookie lewat pengaturan browser. Catatan:
memblokir cookie session membuat Anda tidak bisa masuk, memblokir cookie reset
password membuat alur lupa-password tidak berfungsi, dan memblokir cookie login
Google membuat tombol "Lanjutkan dengan Google" selalu gagal (cookie itulah yang
membuktikan permintaan benar-benar berasal dari browser Anda).

## Perubahan

Perubahan kebijakan cookie diumumkan di halaman ini dengan tanggal berlaku baru.

---

# Cookie Policy — Rilisin (English translation, non-binding)

**DRAFT — review by licensed counsel before publishing.**

1. **Our cookies** (from the actual codebase, not a template):
   - `rilisin_session` / `__Host-rilisin_session` — 30 days, keeps you signed in
   - `rilisin_mfa` / `__Host-rilisin_mfa` — 10 minutes, 2FA challenge
   - `rilisin_reset` / `__Secure-rilisin_reset` — 30 minutes, password reset
     token scoped to the reset page
   - `rilisin_verify` / `__Secure-rilisin_verify` — 24 hours, email verification
     token scoped to `/verifikasi-email`
   - `rilisin_oauth` / `__Secure-rilisin_oauth` — 10 minutes, Google sign-in
     ticket (random `state` + PKCE verifier, single use)
   All are `HttpOnly`. On HTTPS the session cookie uses `__Host-` + `Secure` +
   `SameSite=None; Partitioned`; on HTTP it uses `SameSite=Lax`.
2. **Third-party:** Cloudflare Turnstile may set cookies on
   `challenges.cloudflare.com` when a challenge is shown. No ad, analytics, or
   social tracking cookies.
3. **Blocking cookies:** you can block or delete them in your browser; blocking
   the session cookie prevents sign-in, and blocking the reset cookie breaks the
   forgot-password flow.
4. **Changes** are announced here with a new effective date.

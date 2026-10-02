# PRD — Rilisin (consolidated 2026-09-28)

Status: DRAFT working document, reconstructed from the repository (README, SECURITY.md,
CI, code) because the original blueprint lives outside the repo. Sections marked
ASSUMPTION are estimates, not verified facts.

## 1. Problem

Indonesian developers ship apps, games, source code, templates, design assets, and
e-books, but have no trusted local place to distribute them: general marketplaces
treat unknown binaries as untrusted, social channels have no purchase flow, and
"gratis vs bayar" needs two different platforms. Buyers cannot tell whether a
download is safe or whether the seller is the real author.

## 2. Target users

- Primary: Indonesian developers (solo/small studio) who want to share free work
  and sell paid work without building a store.
- Secondary: Indonesian developers and students looking for local, bahasa-first
  tutorials, templates, and assets; communities that want to discuss them.
- Tertiary: buyers outside Indonesia who find the work through search (UX stays
  bahasa-first; ASSUMPTION: <10% of early traffic).

## 3. Real-world impact

A working distribution path lets local devs earn from work that currently leaks
through unprotected file-sharing links, and gives buyers a scanned, moderated
source with reviews from verified owners.

## 4. Business model (revenue plan)

- Primary: marketplace commission on paid products (platform fee on each sale),
  gateway fees shown transparently and paid by the buyer (current behavior).
- Secondary: later — featured placement/ads for sellers, and paid "verified
  developer" tier (ASSUMPTION: not yet designed).
- Payment rails already integrated: Pakasir (QRIS, VA BRI/BNI/Permata/CIMB/Maybank)
  for Indonesian methods; Stripe/Lemon Squeezy are options for global (ASSUMPTION:
  not integrated yet).
- Unit economics: ASSUMPTION — commission 5-10% per sale; variable cost per sale
  dominated by gateway fee (QRIS cheapest) + blob storage + bandwidth; zero fixed
  cost while on free tiers (Vercel, Neon, Vercel Blob).
- One metric per stage: activation (seller publishes first product) → D7/D30
  retention of buyers → MRR from commissions → scale.

## 5. Scope

In (built): catalog, upload with signed download URLs, library, seller dashboard,
checkout QRIS/VA, orders, seller balance ledger, 7-day holding, payouts, refunds,
admin finance panel, chat rooms, forum, reviews (owners only), follows, devlog,
reports, profiles with badges, notifications (in-app + email), password reset,
2FA/TOTP, CSP nonce, Turnstile, shared rate limits, security event log, ClamAV
malware scanning with a scheduled worker, encrypted DB backups, admin System page.

Out (for now): native mobile apps, live streaming, AI recommendations, multi-
currency, affiliate program, auction/bidding.

## 6. Feature priority (impact / effort)

1. Keep the killer flow safe and fast: browse → product page → download/purchase
   (impact: everything depends on it).
2. Seller activation: 3-step publish + verification checklist (impact: supply).
3. Trust signals: scan-verified badge, owner-only reviews (impact: conversion).
4. Community retention: chat + forum + devlog (impact: D30).
5. Ops reliability: alerts, runbooks, budgets (impact: survival).

## 7. i18n

Bahasa Indonesia is the product language (`<html lang="id">`). English README and
an English UI skin are candidates for later; message catalogs are not yet extracted
(current strings are inline). RTL not needed. Date/number formatting goes through
`src/lib/format.ts` — keep every new string on that path.

## 8. Threat model (summary; details in SECURITY.md)

Assets: user accounts, seller balances, uploaded binaries, order/payment state,
community content. Main threats: XSS via uploaded HTML/markdown, CSRF on state-
changing actions, IDOR on products/orders/files, payment webhook forgery/replay,
brute force and credential stuffing, malware distribution through uploads, L7
abuse/cost-DoS, supply-chain compromise of CI. Controls in place: nonce CSP +
strict-dynamic, server-side per-object authorization checks, HMAC/constant-time
webhook secret with gateway re-confirmation, shared Postgres rate limits, TOTP 2FA,
ClamAV scanning with blocked hashes, signed expiring download URLs, SHA-pinned
actions. Proving tests: smoke suite (297 checks), Pakasir contract test, backup
restore test, ClamAV EICAR test — all in CI.

## 9. Stack (current stable, 2026-09)

Next.js 16.3.6, React 19.3.0, TypeScript strict, Tailwind CSS 4, Drizzle ORM
0.45 + Postgres (Neon), Vercel Blob storage, Zod 4, sharp, qrcode, react-markdown
(remark-gfm). Node >= 20.9. Package manager: npm (lockfile committed).

## 10. Platform and free-tier plan

- Vercel (web + cron), Neon Postgres (free tier), Vercel Blob (free tier),
  Cloudflare Turnstile (free), Resend email (optional, free tier), GitHub Actions
  (2000 min/month public repo), Pakasir (pay-per-transaction).
- Limits to watch: Vercel function duration + bandwidth, Neon storage/compute
  hours, Blob storage/bandwidth, Actions minutes. Fallbacks: degrade to polling
  (already done for order status), hard per-user upload quotas, budget alerts.
- Portability: storage, payment, email, and push sit behind thin adapters
  (`src/lib/storage`, `src/lib/payments/provider`, `src/lib/email.ts`) so a
  provider swap stays a one-file change.

## 11. Architecture sketch

Next.js App Router (force-dynamic pages) → route handlers + server actions →
Drizzle → Postgres. `src/middleware.ts` handles site lock + CSP nonce for every request.
Uploads: init (signed token) → storage → complete (verify + scan) → release gate.
Payments: create order → Pakasir → webhook (re-confirmed via API) → ledger.
Community: chat polling + SSE stream, forum threads, notifications fan-out.

## 12. CI/CD

lint → typecheck → seed → backup/restore test → build → smoke test (297 checks)
→ Pakasir contract test → dependency audit (npm audit high/critical) → deploy
staging (Vercel, main only, environment secrets). Antivirus (ClamAV) and UI audit
run as separate path-filtered workflows. All actions pinned by commit SHA.

## 13. Visual identity

Working name "Rilisin", Plus Jakarta Sans, brand purple (#5b43f5), calm light
surfaces, inline SVG icons (lucide-react). A written identity brief
(`docs/DESIGN.md`) with palette derivation, spacing scale, motion language, and
XyVerse-owned icon rules is still missing — required before public launch.

## 14. Owned assets

None in-repo yet besides the wordmark/logo components. XyVerse brand kit lives
outside the repo (see kall's assets). Rule: every shipped icon/illustration is
XyVerse-owned or listed in THIRD_PARTY_NOTICES.md; no traced/recolored third-party
art.

## 15. Growth plan

Free products as the top of funnel, RSS/new-works feed, devlog cadence, launch
posts (dev.to, Show HN, Product Hunt, Indonesian dev communities), comparison
docs against alternatives, contributor funnel with `good first issue` labels.
No bought engagement, no fake metrics.

## 16. Legal set needed before public launch

Terms of Service, Privacy Policy (UU PDP No. 27/2022 + GDPR clauses if EU users),
Cookie Policy, Acceptable Use Policy, Refund Policy, seller agreement, trademark
note for "XyVerse Technology Global", store compliance notes. All DRAFT-marked
until counsel review. LICENSE exists (proprietary, DRAFT).

## 17. Milestones (real dates)

- 2026-09-27 — repo created, Fase 1-4 prototype built (from git history).
- 2026-09-28 — audit, CI hardening (SHA pinning + dependency audit), attribution,
  LICENSE/NOTICES/PROGRESS/PRD/ROADMAP.
- 2026-10-05 (target) — legal drafts complete; DESIGN.md written.
- 2026-10-19 (target) — production cutover checklist: domain, secrets rotation,
  budgets/alerts, runbooks.
- 2026-11-02 (target) — public launch gate: all legal reviewed, security proving
  tests green, support path live.

## 18. Open questions

1. License: proprietary (current) vs open-core — changes contribution strategy.
2. Final product name and domain ("Rilisin" is a working name; merek not checked).
3. Commission rate and who pays gateway fees in production (current: buyer).
4. Whether to invest in English UI now or after Indonesian traction.

## Ringkasan eksekutif (Bahasa Indonesia)

1. Rilisin = marketplace karya developer Indonesia: share gratis + jual bayar, plus komunitas.
2. Masalah: dev lokal tak punya kanal distribusi tepercaya; pembeli tak bisa beda file aman vs berisiko.
3. Model bisnis: komisi per transaksi (ASSUMPTION 5-10%), biaya gateway dibayar pembeli, tanpa biaya tetap di free tier.
4. Yang sudah jadi: katalog, upload aman + scan ClamAV, checkout QRIS/VA, saldo seller, chat, forum, ulasan pemilik, 2FA, CSP, rate limit bersama, backup terenkripsi.
5. Yang belum: legal publik (Terms/Privacy/Cookie/AUP), DESIGN.md, nama & domain final, aplikasi mobile, UI bahasa Inggris.
6. Target metrik: aktivasi seller (publish pertama) → retensi D7/D30 pembeli → MRR komisi.
7. Risiko utama: merek belum dicek, ketergantungan free tier, abuse/biaya, dan legal belum siap launch.
8. Arsitektur: Next.js 16 + Postgres (Neon) + Vercel Blob; pembayaran Pakasir dengan re-confirm webhook.
9. CI: lint → typecheck → tes (297 cek) → audit dependency → deploy staging; semua action di-pin SHA.
10. Milestone: legal + DESIGN.md target 5 Okt 2026, cutover produksi 19 Okt 2026, gerbang launch publik 2 Nov 2026.

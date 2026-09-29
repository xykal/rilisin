# Self-host Rilisin (jalur $0 — Oracle Always Free / VPS). Panduan: docs/SELFHOST.md
# Pola resmi Next.js standalone. Base Debian (bukan Alpine) supaya `sharp`
# (konversi gambar) jalan tanpa drama kompilasi.

# ── Tahap 1: dependency penuh (termasuk devDeps untuk build + migrasi) ──
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Tahap 2: build ──
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Tahap 3a: migrator (service compose `migrate`, jalan tiap deploy) ──
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["npx", "tsx", "scripts/migrate.ts"]

# ── Tahap 3b: runner minimal (non-root) ──
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/data/storage && chown nextjs:nodejs /app/data/storage
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

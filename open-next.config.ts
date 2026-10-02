import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Semua halaman force-dynamic dan data dari Postgres, jadi tanpa incremental cache (R2/KV).
export default defineCloudflareConfig();

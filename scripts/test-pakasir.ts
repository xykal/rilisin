/**
 * Contract test adapter Pakasir API v2 + handler webhook, memakai server Pakasir PALSU yang meniru dokumentasi
 * resmi (https://pakasir.com/p/create-transaction, /transaction-status, /webhook, /cancel-transaction, /fee-calculator).
 * Tidak menyentuh akun Pakasir sungguhan.
 *   npx tsx --conditions=react-server scripts/test-pakasir.ts
 * Butuh database lokal yang sudah di-seed (menambah data uji → jalankan `npm run db:seed` lagi sesudahnya).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

type Txn = { txn_id: string; order_id: string; amount: number; method: string; status: "pending" | "completed" | "canceled" };
const txns = new Map<string, Txn>();
const byOrder = new Map<string, string>();
const seen: { method: string; path: string; key: string | null; body: unknown }[] = [];
const KEY = "kunci-uji-123";
const SLUG = "rilisin-uji";
let n = 0;

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  const body = raw ? JSON.parse(raw) : null;
  const url = new URL(req.url ?? "/", "http://x");
  seen.push({ method: req.method ?? "", path: url.pathname, key: (req.headers["x-api-key"] as string) ?? null, body });
  const send = (code: number, data: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const fee = /^\/api\/v2\/payment-fee\/(\d+)$/.exec(url.pathname);
  if (fee && req.method === "GET") return send(200, { qris: Math.ceil(Number(fee[1]) * 0.007) + 310, bri_va: 3500, bni_va: 3500, permata_va: 3500, cimb_niaga_va: 3500, maybank_va: 3500 });
  if (req.headers["x-api-key"] !== KEY) return send(401, { message: "Api key tidak valid" });
  const create = /^\/api\/v2\/create-transaction\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (create && req.method === "POST") {
    const [, slug, orderId] = create;
    if (slug !== SLUG) return send(404, { message: "Proyek tidak ditemukan" });
    let t = txns.get(byOrder.get(orderId!) ?? "");
    if (!t) {
      t = { txn_id: `txn${++n}`, order_id: orderId!, amount: body.amount, method: body.method, status: "pending" };
      txns.set(t.txn_id, t);
      byOrder.set(orderId!, t.txn_id);
    }
    const f = t.method === "qris" ? Math.ceil(t.amount * 0.007) + 310 : 3500;
    return send(200, { txn_id: t.txn_id, project: SLUG, order_id: t.order_id, amount: t.amount, fee: f, total_payment: t.amount + f, payment_method: t.method, qr_string: t.method === "qris" ? "00020101021226610016ID.CO.QRIS.WWW-UJI" : "", va_number: t.method === "qris" ? "" : "8808123412341234", expired_at: new Date(Date.now() + 3600_000).toISOString(), is_sandbox: true, status: t.status, completed_at: null });
  }
  const status = /^\/api\/v2\/transaction-status\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (status && req.method === "GET") {
    const t = txns.get(status[2]!);
    if (!t) return send(404, { message: "Transaksi tidak ditemukan" });
    return send(200, { txn_id: t.txn_id, order_id: t.order_id, amount: t.amount, is_sandbox: true, status: t.status, completed_at: t.status === "completed" ? new Date().toISOString() : null });
  }
  const cancel = /^\/api\/v2\/cancel-transaction\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (cancel && req.method === "POST") {
    const t = txns.get(cancel[2]!);
    if (t) t.status = "canceled";
    return send(200, { message: "Berhasil batalkan transaksi" });
  }
  send(404, { message: "not found" });
});

let passed = 0;
function ok(cond: unknown, label: string) {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "pakasir",
    PAKASIR_BASE_URL: `http://127.0.0.1:${port}`,
    PAKASIR_SLUG: SLUG,
    PAKASIR_API_KEY: KEY,
    PAKASIR_WEBHOOK_SECRET: "rahasia-webhook-uji",
    PAKASIR_ALLOW_SANDBOX: "1",
  });

  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { createOrder, handlePakasirWebhook, reconcileOrder } = await import("../src/lib/payments/orders");
  const { paymentProvider, verifyPakasirWebhookSecret } = await import("../src/lib/payments/provider");
  const route = await import("../src/app/api/payments/pakasir/webhook/route");

  const userId = async (u: string) => (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, u)).limit(1))[0]!.id;
  const productId = async (slug: string) => (await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug)).limit(1))[0]!.id;
  const buyer = await userId("maya23");
  const pro = await productId("kasirku-pro");

  // 1. Biaya: endpoint publik, TANPA api key
  const fees = await paymentProvider().feeTable(49_000);
  const feeReq = seen.find((s) => s.path === "/api/v2/payment-fee/49000");
  ok(fees.qris === 653 && feeReq && feeReq.key === null, "Fee dari API publik v2 (tanpa X-Api-Key): QRIS Rp653 untuk Rp49.000");

  // 2. Buat transaksi
  const r = await createOrder({ id: buyer }, { productId: pro, method: "qris" });
  if (r.kind !== "order") throw new Error("harusnya order");
  const order = r.order;
  const createReq = seen.find((s) => s.path.startsWith("/api/v2/create-transaction/"));
  ok(createReq?.path === `/api/v2/create-transaction/${SLUG}/${order.code}` && createReq.key === KEY, "Create transaksi: POST /api/v2/create-transaction/{slug}/{order_id} + header X-Api-Key");
  ok(JSON.stringify(createReq?.body) === JSON.stringify({ method: "qris", amount: 49_000 }), "Body create hanya {method, amount} — api_key TIDAK di body (bukan API v1)");
  ok(order.providerTxnId === "txn1" && order.gatewayFeeIdr === 653 && order.totalPayIdr === 49_653 && order.isSandbox && order.paymentData?.qrString?.startsWith("000201"), "Respons gateway tersimpan: txn_id, fee, total, qr_string, is_sandbox");
  const r2 = await createOrder({ id: buyer }, { productId: pro, method: "qris" });
  ok(r2.kind === "order" && r2.order.code === order.code && txns.size === 1, "Checkout ulang → pesanan & transaksi yang sama (tidak membuat transaksi baru)");

  // 3. Secret webhook
  ok(verifyPakasirWebhookSecret("rahasia-webhook-uji") && !verifyPakasirWebhookSecret("salah") && !verifyPakasirWebhookSecret(null), "Header X-Secret dicek (benar lolos, salah/kosong ditolak)");

  // 4. Webhook "completed" tapi gateway bilang masih pending → ditolak
  const wb = { txn_id: "txn1", order_id: order.code, amount: 49_000, is_sandbox: true, status: "completed", completed_at: new Date().toISOString() };
  const early = await handlePakasirWebhook(wb);
  ok(early.status === 409 && early.result === "not_confirmed", "Webhook tidak dipercaya mentah: status dikonfirmasi ulang ke API (masih pending → ditolak)");

  txns.get("txn1")!.status = "completed";
  const wrongAmount = await handlePakasirWebhook({ ...wb, amount: 1_000 });
  ok(wrongAmount.status === 409, "Webhook dengan nominal beda dari transaksi ditolak");

  // 5. Lewat route HTTP: secret salah → 401; body tanpa header JSON tetap diproses (contoh resmi pakai curl --data)
  const bad = await route.POST(new Request("http://localhost/api/payments/pakasir/webhook", { method: "POST", headers: { "x-secret": "salah", "content-type": "application/json" }, body: JSON.stringify(wb) }));
  ok(bad.status === 401, "Route webhook: X-Secret salah → 401");
  const good = await route.POST(new Request("http://localhost/api/payments/pakasir/webhook", { method: "POST", headers: { "x-secret": "rahasia-webhook-uji", "content-type": "application/x-www-form-urlencoded" }, body: JSON.stringify(wb) }));
  const goodJson = (await good.json()) as { result: string };
  ok(good.status === 200 && goodJson.result === "paid", "Route webhook: secret benar + status terkonfirmasi → pesanan LUNAS");

  const [paid] = await db.select().from(schema.orders).where(eq(schema.orders.code, order.code));
  const ledger = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, order.id));
  const ent = await db.select().from(schema.entitlements).where(and(eq(schema.entitlements.userId, buyer), eq(schema.entitlements.productId, pro)));
  ok(paid!.status === "paid" && ledger.length === 1 && ledger[0]!.amountIdr === 44_100 && ent.length === 1 && ent[0]!.source === "purchase", "Lunas → akses produk + saldo seller Rp44.100 (tertahan)");

  const replay = await route.POST(new Request("http://localhost/api/payments/pakasir/webhook", { method: "POST", headers: { "x-secret": "rahasia-webhook-uji" }, body: JSON.stringify(wb) }));
  const ledger2 = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, order.id));
  ok(replay.status === 200 && ((await replay.json()) as { result: string }).result === "duplicate" && ledger2.length === 1, "Webhook dikirim ulang → 'duplicate', saldo tidak dobel");

  // 6. Polling (webhook hilang): transaksi selesai di gateway → halaman pesanan melunasi sendiri
  const buyer2 = await userId("citra27");
  const r3 = await createOrder({ id: buyer2 }, { productId: pro, method: "bri_va" });
  if (r3.kind !== "order") throw new Error("harusnya order");
  ok(r3.order.paymentData?.vaNumber === "8808123412341234" && r3.order.gatewayFeeIdr === 3500, "VA: nomor Virtual Account & biaya Rp3.500 tersimpan");
  txns.get(r3.order.providerTxnId!)!.status = "completed";
  const polled = await reconcileOrder(r3.order.code);
  ok(polled?.status === "paid", "Polling status (tanpa webhook) → pesanan LUNAS");
  const statusCalls = seen.filter((s) => s.path.startsWith("/api/v2/transaction-status/"));
  ok(statusCalls.every((s) => s.key === KEY && s.path.startsWith(`/api/v2/transaction-status/${SLUG}/`)), "Cek status: GET /api/v2/transaction-status/{slug}/{txn_id} + X-Api-Key");

  // 7. Mode live menolak transaksi sandbox
  process.env.PAKASIR_ALLOW_SANDBOX = "0";
  const buyer3 = await userId("eko28");
  let threw = "";
  try {
    await createOrder({ id: buyer3 }, { productId: pro, method: "qris" });
  } catch (e) {
    threw = (e as Error).message;
  }
  const canceledSandbox = [...txns.values()].some((t) => t.status === "canceled");
  ok(threw.includes("mode sandbox") && canceledSandbox, "Situs mode live: transaksi sandbox ditolak & dibatalkan di gateway");

  server.close();
  console.log(`\nSemua ${passed} pengecekan kontrak Pakasir v2 lulus.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

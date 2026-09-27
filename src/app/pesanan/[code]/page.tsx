import { CheckCircle2, Clock, Download, FlaskConical, Library, ReceiptText, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cancelOrderAction, simulatePaymentAction } from "@/app/actions/payments";
import { ProductIcon } from "@/components/bits";
import { CopyButton, Countdown, OrderPoller } from "@/components/payment-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { isStaff } from "@/lib/auth/current-user";
import { requireUser } from "@/lib/auth/guards";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL, paymentMethod } from "@/lib/payments/methods";
import { reconcileOrder } from "@/lib/payments/orders";
import { isSimulationMode } from "@/lib/payments/provider";
import { getOrderByCode } from "@/lib/payments/queries";

export const metadata: Metadata = { title: "Pesanan", robots: { index: false } };

export default async function OrderPage({ params }: PageProps<"/pesanan/[code]">) {
  const { code } = await params;
  const user = await requireUser(`/pesanan/${code}`);
  let row = await getOrderByCode(code);
  if (!row || (row.order.buyerId !== user.id && !isStaff(user))) notFound();
  if (row.order.status === "pending") {
    await reconcileOrder(code);
    row = (await getOrderByCode(code))!;
  }
  const o = row.order;
  const m = paymentMethod(o.paymentMethod);
  const st = ORDER_STATUS_LABEL[o.status] ?? { label: o.status, tone: "slate" as const };
  const total = o.totalPayIdr || o.amountIdr + o.gatewayFeeIdr;
  const pending = o.status === "pending";
  const qr = pending && o.paymentData?.qrString
    ? `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(o.paymentData.qrString, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f1222", light: "#ffffff" } })).toString("base64")}`
    : null;
  const simulation = isSimulationMode() && o.provider === "mock";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <OrderPoller code={o.code} status={o.status} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-700">Pesanan</p>
          <h1 className="font-mono text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{o.code}</h1>
        </div>
        <Badge tone={st.tone} className="!text-sm">
          {st.label}
        </Badge>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-4 border-b border-slate-100 p-5">
          <ProductIcon iconKey={row.productIconKey} title={o.productTitle} size={52} />
          <div className="min-w-0 flex-1">
            <Link href={`/p/${row.productSlug}`} className="font-bold text-ink hover:text-brand-700">
              {o.productTitle}
            </Link>
            <p className="truncate text-sm text-slate-500">oleh {row.storeName}</p>
          </div>
        </div>

        {pending && (
          <div className="border-b border-slate-100 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Clock className="h-5 w-5 text-amber-600" /> Selesaikan pembayaran
              </h2>
              <p className="text-sm text-slate-600">
                Sisa waktu <Countdown expiresAt={o.expiresAt.toISOString()} />
              </p>
            </div>
            <div className="mt-5 grid grid-cols-1 items-start gap-6 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              {qr ? (
                <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-slate-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QRIS untuk pesanan ${o.code}`} className="aspect-square w-full" />
                  <p className="mt-2 text-center text-xs font-semibold text-slate-500">{simulation ? "QR SIMULASI — jangan di-scan" : "Scan pakai e-wallet / m-banking"}</p>
                </div>
              ) : o.paymentData?.vaNumber ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m?.label ?? "Virtual Account"}</p>
                  <p className="mt-1 break-all font-mono text-2xl font-extrabold tracking-wider text-ink">{o.paymentData.vaNumber}</p>
                  <div className="mt-2">
                    <CopyButton text={o.paymentData.vaNumber} label="Salin nomor VA" />
                  </div>
                </div>
              ) : o.paymentData?.paymentLink ? (
                <ButtonLink href={o.paymentData.paymentLink} className="w-full">
                  Buka halaman pembayaran
                </ButtonLink>
              ) : (
                <Alert tone="warning">Data pembayaran belum tersedia. Muat ulang halaman sebentar lagi.</Alert>
              )}
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                  Bayar tepat <b className="text-base">{formatRupiah(total)}</b>{" "}
                  <CopyButton text={String(total)} label="Salin nominal" />
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  {m?.kind === "qr" ? (
                    <>
                      <li>Buka GoPay, OVO, DANA, ShopeePay, LinkAja, atau m-banking.</li>
                      <li>Pilih bayar / scan QRIS, arahkan ke kode di samping.</li>
                      <li>Cek nama merchant & nominal, lalu konfirmasi.</li>
                    </>
                  ) : (
                    <>
                      <li>Buka m-banking / ATM, pilih transfer ke Virtual Account.</li>
                      <li>Masukkan nomor VA di samping, cek nominal.</li>
                      <li>Konfirmasi dengan PIN.</li>
                    </>
                  )}
                  <li>Halaman ini otomatis berubah begitu pembayaran masuk.</li>
                </ol>
              </div>
            </div>
            {simulation && (
              <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <FlaskConical className="h-4 w-4" /> Mode simulasi (belum ada gateway asli)
                </p>
                <p className="mt-1 text-xs text-amber-800">Tombol ini menjalankan jalur kode yang sama dengan webhook pembayaran sungguhan.</p>
                <form action={simulatePaymentAction} className="mt-3">
                  <input type="hidden" name="code" value={o.code} />
                  <SubmitButton variant="success" pendingText="Memproses…">
                    Simulasikan pembayaran berhasil
                  </SubmitButton>
                </form>
              </div>
            )}
            {o.buyerId === user.id && (
              <form action={cancelOrderAction} className="mt-4">
                <input type="hidden" name="code" value={o.code} />
                <SubmitButton variant="ghost" className="!px-0 text-slate-500" confirm="Batalkan pesanan ini?">
                  Batalkan pesanan
                </SubmitButton>
              </form>
            )}
          </div>
        )}

        {o.status === "paid" && (
          <div className="border-b border-slate-100 bg-emerald-50/60 p-5 sm:p-7">
            <p className="flex items-center gap-2 text-lg font-bold text-emerald-900">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" /> Pembayaran berhasil
            </p>
            <p className="mt-1 text-sm text-emerald-900/80">Produk sudah masuk Library kamu. Update versi baru otomatis tersedia.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href={`/p/${row.productSlug}`}>
                <Download className="h-4 w-4" /> Download sekarang
              </ButtonLink>
              <ButtonLink href="/library" variant="secondary">
                <Library className="h-4 w-4" /> Buka Library
              </ButtonLink>
            </div>
          </div>
        )}

        {(o.status === "expired" || o.status === "canceled") && (
          <div className="border-b border-slate-100 p-5 sm:p-7">
            <p className="flex items-center gap-2 font-bold text-ink">
              <XCircle className="h-5 w-5 text-slate-400" /> {o.status === "expired" ? "Waktu pembayaran habis" : "Pesanan dibatalkan"}
            </p>
            <p className="mt-1 text-sm text-slate-600">Belum ada dana yang ditarik. Kalau sudah terlanjur bayar, tunggu sebentar — pembayaran yang masuk tetap kami proses.</p>
            <ButtonLink href={`/beli/${row.productSlug}`} className="mt-4">
              Buat pesanan baru
            </ButtonLink>
          </div>
        )}

        {o.status === "refunded" && (
          <div className="border-b border-slate-100 bg-red-50/50 p-5 sm:p-7 text-sm text-red-900">
            <p className="font-bold">Pesanan ini sudah di-refund</p>
            <p className="mt-1">Alasan: {o.refundReason ?? "-"}. Akses produk dicabut; dana dikembalikan admin ke rekening kamu.</p>
          </div>
        )}

        <div className="p-5 sm:p-7">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <ReceiptText className="h-5 w-5 text-slate-400" /> Rincian
          </h2>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            {[
              ["Harga produk", formatRupiah(o.amountIdr)],
              ["Biaya layanan pembayaran", formatRupiah(o.gatewayFeeIdr)],
              ["Total", formatRupiah(total)],
              ["Metode", m?.label ?? o.paymentMethod],
              ["Dibuat", formatDateTime(o.createdAt)],
              ...(o.paidAt ? [["Dibayar", formatDateTime(o.paidAt)]] : []),
              ["Pembeli", `${row.buyerName} (@${row.buyerUsername})`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {o.isSandbox && !simulation && <p className="mt-3 text-xs font-semibold text-amber-700">Transaksi sandbox (uji coba gateway).</p>}
        </div>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/akun/pesanan" className="font-semibold text-brand-700 hover:underline">
          Semua pesanan saya
        </Link>
      </p>
    </div>
  );
}

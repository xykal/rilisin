import "server-only";

/**
 * Kirim email transaksional. Provider:
 *  - Resend (https://resend.com) kalau RESEND_API_KEY + EMAIL_FROM diisi. EMAIL_FROM wajib pakai domain yang
 *    sudah diverifikasi di Resend (contoh: "Rilisin <noreply@rilisin.id>").
 *  - Selain itu: hanya dicatat ke log server (development / belum punya domain).
 * Gagal kirim email TIDAK boleh menggagalkan transaksi — pemanggil cukup fire-and-forget.
 *
 * Alamat di domain cadangan/uji (.test, .example, .invalid, .localhost, example.com, dst.) TIDAK pernah dikirim:
 * akun demo memakai domain itu, dan email yang terpental (bounce) merusak reputasi domain pengirim.
 */
const RESERVED_TLDS = ["test", "example", "invalid", "localhost", "local"];
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"];

export function isUndeliverableAddress(to: string) {
  const domain = to.split("@")[1]?.toLowerCase().trim().replace(/\.$/, "") ?? "";
  if (!domain || !domain.includes(".")) return true;
  const tld = domain.split(".").pop()!;
  return RESERVED_TLDS.includes(tld) || RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appUrl() {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Mis. List-Unsubscribe untuk notifikasi. */
  headers?: Record<string, string>;
};

export async function sendEmail(msg: EmailMessage) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (isUndeliverableAddress(msg.to)) {
    console.info(`[email:dilewati] alamat uji/tidak valid ke=${msg.to} subjek="${msg.subject}"`);
    return { ok: true, provider: "skipped" as const };
  }
  if (!key || !from) {
    console.info(`[email:log] ke=${msg.to} subjek="${msg.subject}"`);
    return { ok: true, provider: "log" as const };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Resend menolak", res.status, (await res.text()).slice(0, 200));
    return { ok: res.ok, provider: "resend" as const };
  } catch (err) {
    console.error("[email] gagal kirim", (err as Error).message);
    return { ok: false, provider: "resend" as const };
  }
}

/**
 * Kirim banyak email sekaligus lewat Resend batch API (maks. 100 per request) — dipakai notifikasi massal
 * (mis. versi baru ke semua pengikut) supaya tidak membuat ratusan request satu per satu.
 */
export async function sendEmailBatch(msgs: EmailMessage[]) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const deliverable = msgs.filter((m) => {
    const skip = isUndeliverableAddress(m.to);
    if (skip) console.info(`[email:dilewati] alamat uji/tidak valid ke=${m.to} subjek="${m.subject}"`);
    return !skip;
  });
  if (!deliverable.length) return { sent: 0 };
  if (!key || !from) {
    for (const m of deliverable) console.info(`[email:log] ke=${m.to} subjek="${m.subject}"`);
    return { sent: 0 };
  }
  let sent = 0;
  for (let i = 0; i < deliverable.length; i += 100) {
    const chunk = deliverable.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) sent += chunk.length;
      else console.error("[email] Resend batch menolak", res.status, (await res.text()).slice(0, 200));
    } catch (err) {
      console.error("[email] batch gagal", (err as Error).message);
    }
  }
  return { sent };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Template email sederhana (inline style — klien email tidak mendukung CSS eksternal).
 * Semua teks di-escape; hanya `rowsHtml` yang dianggap HTML aman dari pemanggil.
 */
export function renderEmail(opts: {
  heading: string;
  paragraphs?: string[];
  cta?: { label: string; url: string };
  /** Baris tabel label → nilai (mis. rincian pesanan). */
  rows?: [string, string][];
  footnote?: string;
  unsubscribeUrl?: string;
}) {
  const paragraphs = opts.paragraphs?.filter(Boolean) ?? [];
  const rowsHtml = opts.rows?.length
    ? `<table cellpadding="6" style="border-collapse:collapse;margin:8px 0 16px">${opts.rows
        .map(([k, v]) => `<tr><td style="color:#64748b;padding-right:16px">${escapeHtml(k)}</td><td style="color:#0f1222"><b>${escapeHtml(v)}</b></td></tr>`)
        .join("")}</table>`
    : "";
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#f5f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:800;color:#5b43f5">Rilisin</td></tr>
<tr><td style="padding:8px 28px 24px;color:#0f1222;font-size:15px;line-height:1.6">
<h1 style="font-size:19px;line-height:1.4;margin:0 0 12px;color:#0f1222">${escapeHtml(opts.heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(p)}</p>`).join("")}
${rowsHtml}
${opts.cta ? `<p style="margin:20px 0 8px"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#5b43f5;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">${escapeHtml(opts.cta.label)}</a></p>` : ""}
${opts.footnote ? `<p style="margin:16px 0 0;color:#64748b;font-size:13px">${escapeHtml(opts.footnote)}</p>` : ""}
</td></tr>
${opts.unsubscribeUrl ? `<tr><td style="padding:14px 28px 22px;border-top:1px solid #eef0f6;color:#94a3b8;font-size:12px">Tidak mau email seperti ini? <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#64748b">Berhenti berlangganan</a> atau atur di Pengaturan notifikasi.</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [
    opts.heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(opts.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(opts.rows?.length ? [""] : []),
    ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ""] : []),
    ...(opts.footnote ? [opts.footnote, ""] : []),
    ...(opts.unsubscribeUrl ? [`Berhenti berlangganan: ${opts.unsubscribeUrl}`] : []),
    "— Rilisin",
  ].join("\n");
  return { html, text };
}

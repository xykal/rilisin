import "server-only";

/**
 * Kirim email transaksional. Provider:
 *  - Resend (https://resend.com) kalau RESEND_API_KEY + EMAIL_FROM diisi. EMAIL_FROM wajib pakai domain yang
 *    sudah diverifikasi di Resend (contoh: "Rilisin <noreply@rilisin.id>").
 *  - Selain itu: hanya dicatat ke log server (development / belum punya domain).
 * Gagal kirim email TIDAK boleh menggagalkan transaksi — pemanggil cukup fire-and-forget.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:log] ke=${msg.to} subjek="${msg.subject}"`);
    return { ok: true, provider: "log" as const };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Resend menolak", res.status, (await res.text()).slice(0, 200));
    return { ok: res.ok, provider: "resend" as const };
  } catch (err) {
    console.error("[email] gagal kirim", (err as Error).message);
    return { ok: false, provider: "resend" as const };
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

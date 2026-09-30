"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailConfigured, isUndeliverableAddress, renderEmail, sendEmail, appUrl } from "@/lib/email";
import { markAllRead, readUnsubscribeToken, setEmailPrefs } from "@/lib/notifications/server";
import { pushConfigured, sendPush, setPushPrefs } from "@/lib/notifications/push";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/shared";
import { sharedLimit } from "@/lib/rate-limit";
import type { FormState } from "./form-state";

export async function saveNotificationPrefsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  await setEmailPrefs(user.id, Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.id, formData.get(`email_${c.id}`) === "on"])));
  revalidatePath("/akun/notifikasi");
  return { success: "Pengaturan notifikasi tersimpan." };
}

export async function savePushPrefsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  await setPushPrefs(user.id, Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.id, formData.get(`push_${c.id}`) === "on"])));
  revalidatePath("/akun/notifikasi");
  return { success: "Pengaturan push tersimpan." };
}

export async function markAllReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id);
  revalidatePath("/", "layout");
}

/** Konfirmasi berhenti berlangganan dari link email (tanpa perlu login — diotorisasi token bertanda tangan). */
export async function unsubscribeAction(formData: FormData) {
  const t = readUnsubscribeToken(String(formData.get("t") ?? ""));
  if (!t) redirect("/notifikasi/berhenti?gagal=1");
  await setEmailPrefs(t.userId, { [t.category]: false });
  redirect(`/notifikasi/berhenti?selesai=${t.category}`);
}

/** Kirim email uji ke alamat akun sendiri (cek apakah email sampai / masuk spam). */
export async function sendTestEmailAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  if (!emailConfigured()) return { error: "Pengiriman email belum diaktifkan di server ini." };
  if (isUndeliverableAddress(user.email)) return { error: `${user.email} adalah alamat uji/demo — email tidak dikirim ke domain seperti itu. Pakai akun dengan email asli.` };
  const rl = await sharedLimit(`email:test:${user.id}`, 3, 60 * 60_000);
  if (!rl.ok) return { error: "Maksimal 3 email uji per jam." };
  const { html, text } = renderEmail({
    heading: "Email uji dari Rilisin",
    paragraphs: [`Halo ${user.displayName}, kalau kamu membaca ini, pengiriman email ke ${user.email} sudah berjalan.`, "Tidak perlu membalas email ini."],
    cta: { label: "Atur notifikasi", url: `${appUrl()}/akun/notifikasi` },
  });
  const r = await sendEmail({ to: user.email, subject: "Email uji dari Rilisin", html, text });
  return r.ok ? { success: `Email uji dikirim ke ${user.email}. Cek inbox (dan folder spam).` } : { error: "Email gagal dikirim. Coba lagi beberapa saat lagi." };
}

/** Kirim push uji ke perangkat sendiri (diagnosa: 0 penerima = belum langganan). */
export async function sendTestPushAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  if (!pushConfigured()) return { error: "Push belum diaktifkan di server ini." };
  const rl = await sharedLimit(`push:test:${user.id}`, 3, 60 * 60_000);
  if (!rl.ok) return { error: "Maksimal 3 push uji per jam." };
  const n = await sendPush([
    { externalId: user.id, title: "Push uji dari Rilisin", body: "Kalau HP bergetar, push sudah berjalan.", url: `${appUrl()}/akun/notifikasi` },
  ]).catch(() => -1);
  if (n === null || n < 0)
    return { error: "OneSignal menolak: belum ada perangkat yang langganan ke akun ini. Tekan “Aktifkan push di perangkat ini” di atas sampai status “Push aktif”, lalu coba lagi." };
  // Catatan: angka recipients dari OneSignal tidak bisa dipercaya (sering 0 padahal push sampai).
  // Satu-satunya sinyal valid = API menerima (ada id). Hasil akhir dicek manual di HP.
  return { success: "Push uji dikirim. Cek HP-mu — kalau tidak sampai dalam 1 menit, langganan ulang (Matikan → Aktifkan)." };
}

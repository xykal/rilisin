"use client";

/**
 * Pembungkus tipis OneSignal Web SDK. SDK dimuat malas oleh <PushInit/> di layout;
 * modul ini antre semua panggilan sampai SDK siap (atau gagal dimuat, mis. pemblokir iklan).
 * Semua fungsi aman dipanggil kapan saja — tidak pernah melempar.
 */
import type { OneSignalAPI } from "@/types/onesignal";

let settle: ((os: OneSignalAPI | null) => void) | null = null;
let cached: OneSignalAPI | null | undefined;
let sdkState: "pending" | "ok" | "failed" = "pending";
const ready: Promise<OneSignalAPI | null> = new Promise((res) => {
  settle = res;
});

/** Dipanggil sekali oleh <PushInit/> saat SDK selesai init (atau gagal). Internal saja. */
export function __pushSdkSettled(os: OneSignalAPI | null) {
  cached = os;
  sdkState = os ? "ok" : "failed";
  settle?.(os);
  settle = null;
}

/** Status SDK untuk panel diagnostik. */
export function getSdkState() {
  return sdkState;
}

/** Ambil SDK dengan batas waktu (pemblokir iklan / CDN mati tidak boleh menggantung selamanya). */
async function getSdk(timeoutMs = 15000): Promise<OneSignalAPI | null> {
  if (cached !== undefined) return cached;
  const v = await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
  if (v) return v;
  if (cached !== undefined) return cached;
  if (sdkState === "pending") sdkState = "failed";
  return null;
}

export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export type PushState = {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
};

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return { supported: false, permission: "denied", subscribed: false };
  const permission = Notification.permission;
  let subscribed = false;
  try {
    const os = await getSdk(8000);
    subscribed = os?.User.PushSubscription.optedIn ?? false;
  } catch {
    subscribed = false;
  }
  return { supported: true, permission, subscribed };
}

/** Kaitkan perangkat ini ke akun (dipanggil saat user login). */
export async function loginPush(userId: string) {
  try {
    const os = await getSdk();
    await os?.login(userId);
  } catch (e) {
    console.warn("[push] login gagal", e);
  }
}

/** Lepaskan perangkat dari akun (dipanggil saat logout). */
export async function logoutPush() {
  try {
    const os = await getSdk();
    await os?.logout();
  } catch (e) {
    console.warn("[push] logout gagal", e);
  }
}

/** Minta izin browser + langganan push. Kembalian: "ok" | "denied" | "unavailable". */
export async function enablePush(): Promise<"ok" | "denied" | "dismissed" | "unavailable"> {
  if (!pushSupported()) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  const os = await getSdk();
  if (!os) return "unavailable";
  try {
    await os.User.PushSubscription.optIn();
  } catch (e) {
    console.warn("[push] optIn gagal", e);
  }
  // Baca ulang sebagai string biasa (izin bisa berubah akibat prompt optIn di atas).
  const after: string = Notification.permission;
  if (after === "denied") return "denied";
  if (after === "default") return "dismissed";
  try {
    return os.User.PushSubscription.optedIn ? "ok" : "denied";
  } catch {
    return after === "granted" ? "ok" : "denied";
  }
}

/** Berhenti langganan di perangkat ini (preferensi kategori tidak diubah). */
export async function disablePush() {
  try {
    const os = await getSdk();
    await os?.User.PushSubscription.optOut();
  } catch (e) {
    console.warn("[push] optOut gagal", e);
  }
}

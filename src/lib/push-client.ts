"use client";

/**
 * Pembungkus tipis OneSignal Web SDK. SDK dimuat malas oleh <PushInit/> di layout;
 * modul ini antre semua panggilan sampai SDK siap (atau gagal dimuat, mis. pemblokir iklan).
 * Semua fungsi aman dipanggil kapan saja — tidak pernah melempar.
 */
import type { OneSignalAPI } from "@/types/onesignal";

let settle: ((os: OneSignalAPI | null) => void) | null = null;
const ready: Promise<OneSignalAPI | null> = new Promise((res) => {
  settle = res;
});

/** Dipanggil sekali oleh <PushInit/> saat SDK selesai init (atau gagal). Internal saja. */
export function __pushSdkSettled(os: OneSignalAPI | null) {
  settle?.(os);
  settle = null;
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
    const os = await ready;
    subscribed = os?.User.PushSubscription.optedIn ?? false;
  } catch {
    subscribed = false;
  }
  return { supported: true, permission, subscribed };
}

/** Kaitkan perangkat ini ke akun (dipanggil saat user login). */
export async function loginPush(userId: string) {
  try {
    const os = await ready;
    await os?.login(userId);
  } catch (e) {
    console.warn("[push] login gagal", e);
  }
}

/** Lepaskan perangkat dari akun (dipanggil saat logout). */
export async function logoutPush() {
  try {
    const os = await ready;
    await os?.logout();
  } catch (e) {
    console.warn("[push] logout gagal", e);
  }
}

/** Minta izin browser + langganan push. Kembalian: "ok" | "denied" | "unavailable". */
export async function enablePush(): Promise<"ok" | "denied" | "unavailable"> {
  if (!pushSupported() || Notification.permission === "denied") return "denied";
  const os = await ready;
  if (!os) return "unavailable";
  try {
    await os.User.PushSubscription.optIn();
  } catch (e) {
    console.warn("[push] optIn gagal", e);
  }
  if (Notification.permission === "denied") return "denied";
  try {
    return os.User.PushSubscription.optedIn ? "ok" : "denied";
  } catch {
    return Notification.permission === "granted" ? "ok" : "denied";
  }
}

/** Berhenti langganan di perangkat ini (preferensi kategori tidak diubah). */
export async function disablePush() {
  try {
    const os = await ready;
    await os?.User.PushSubscription.optOut();
  } catch (e) {
    console.warn("[push] optOut gagal", e);
  }
}

"use client";

import Script from "next/script";
import { useEffect } from "react";
import { __pushSdkSettled, loginPush, logoutPush } from "@/lib/push-client";

/**
 * Dipasang sekali di layout. Memuat OneSignal Web SDK dari CDN (malas, setelah halaman
 * interaktif) lalu mengaitkan perangkat ke akun yang sedang login (atau melepas saat logout).
 * Tanpa appId = tidak merender apa-apa (push mati-aman).
 */
export function PushInit({ userId, appId }: { userId: string | null; appId: string }) {
  useEffect(() => {
    if (!appId) return;
    void (userId ? loginPush(userId) : logoutPush());
  }, [userId, appId]);
  if (!appId) return null;
  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="lazyOnload"
      onLoad={() => {
        window.OneSignalDeferred ??= [];
        window.OneSignalDeferred.push(async (os) => {
          try {
            await os.init({ appId, allowLocalhostAsSecureOrigin: window.location.hostname === "localhost" });
            __pushSdkSettled(os);
          } catch (e) {
            console.warn("[push] init gagal", e);
            __pushSdkSettled(null);
          }
        });
      }}
      onError={() => __pushSdkSettled(null)}
    />
  );
}

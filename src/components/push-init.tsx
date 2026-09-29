"use client";

import { useEffect, useRef } from "react";
import { __pushSdkSettled, loginPush, logoutPush } from "@/lib/push-client";

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

/**
 * Dipasang sekali di layout. Memuat OneSignal Web SDK lalu mengaitkan perangkat
 * ke akun yang sedang login (atau melepas saat logout). Tanpa appId = tidak ngapa-ngapain.
 *
 * SDK disuntik saat runtime (bukan <script> statis): CSP memakai 'strict-dynamic'
 * yang MENGABAIKAN allowlist host — tag script tanpa nonce selalu diblokir.
 * Script yang disuntik dari bundle ter-nonce dipercaya via trust propagation (pola GTM).
 */
export function PushInit({ userId, appId }: { userId: string | null; appId: string }) {
  const injected = useRef(false);

  useEffect(() => {
    if (!appId) return;
    if (!injected.current) {
      injected.current = true;
      const el = document.createElement("script");
      el.src = SDK_URL;
      el.async = true;
      el.onload = () => {
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
      };
      el.onerror = () => __pushSdkSettled(null);
      document.head.appendChild(el);
    }
    void (userId ? loginPush(userId) : logoutPush());
  }, [userId, appId]);

  return null;
}

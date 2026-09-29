/**
 * Tipe minimal OneSignal Web SDK v16 (yang dipakai aplikasi saja).
 * SDK dimuat dari CDN (tidak ada paket npm resmi untuk web) — lihat <PushInit/>.
 * Referensi: https://documentation.onesignal.com/docs/web-push-sdk
 */
export interface OneSignalAPI {
  init(opts: { appId: string; allowLocalhostAsSecureOrigin?: boolean }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  User: {
    PushSubscription: {
      readonly optedIn: boolean;
      optIn(): Promise<void>;
      optOut(): Promise<void>;
    };
  };
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalAPI) => void | Promise<void>>;
  }
}

export {};

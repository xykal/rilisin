/** Label kejadian keamanan (dipakai di halaman Keamanan Akun & log admin). */
export const SECURITY_EVENT_LABELS = {
  login_success: { label: "Berhasil masuk", tone: "green" },
  login_failed: { label: "Gagal masuk (password salah)", tone: "amber" },
  login_locked: { label: "Akun dikunci sementara (terlalu banyak gagal)", tone: "red" },
  logout: { label: "Keluar", tone: "slate" },
  register: { label: "Akun dibuat", tone: "brand" },
  bot_blocked: { label: "Formulir diblokir (terdeteksi bot)", tone: "red" },
  mfa_challenge_failed: { label: "Kode 2FA salah", tone: "amber" },
  mfa_challenge_locked: { label: "Verifikasi 2FA diblokir (terlalu banyak salah)", tone: "red" },
  mfa_enabled: { label: "2FA diaktifkan", tone: "green" },
  mfa_disabled: { label: "2FA dimatikan", tone: "red" },
  recovery_code_used: { label: "Masuk memakai kode cadangan", tone: "amber" },
  recovery_codes_regenerated: { label: "Kode cadangan dibuat ulang", tone: "blue" },
  password_changed: { label: "Password diganti", tone: "blue" },
  session_revoked: { label: "Satu perangkat dikeluarkan", tone: "slate" },
  sessions_revoked_all: { label: "Semua perangkat lain dikeluarkan", tone: "slate" },
  chat_blocked: { label: "Pesan chat diblokir filter", tone: "red" },
  chat_report: { label: "Melaporkan pesan", tone: "slate" },
  chat_auto_hidden: { label: "Pesan disembunyikan otomatis (banyak laporan)", tone: "amber" },
  admin_ban: { label: "Admin memblokir akun", tone: "red" },
  admin_unban: { label: "Admin membuka blokir akun", tone: "green" },
  admin_mute: { label: "Moderator membisukan anggota", tone: "amber" },
  admin_delete_message: { label: "Moderator menghapus pesan", tone: "amber" },
  admin_restore_message: { label: "Moderator memulihkan pesan", tone: "green" },
  admin_dismiss_report: { label: "Moderator menolak laporan", tone: "slate" },
} as const;

export type SecurityEventType = keyof typeof SECURITY_EVENT_LABELS;

export function eventLabel(type: string) {
  return (
    SECURITY_EVENT_LABELS[type as SecurityEventType] ?? { label: type, tone: "slate" as const }
  );
}

/** Parse user-agent sederhana → "Chrome di Android". */
export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) return "Perangkat tidak dikenal";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : /node|undici|curl/i.test(ua)
                ? "Skrip/otomatis"
                : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} di ${os}` : browser;
}

export function isMobileUserAgent(ua: string | null | undefined) {
  return !!ua && /Android|iPhone|iPad|iPod|Mobile/.test(ua);
}

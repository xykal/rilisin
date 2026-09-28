import Link from "next/link";
import { Alert } from "./ui";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Banner pengingat verifikasi email untuk halaman /akun/*. Diam kalau email sudah
 * terverifikasi atau pengguna belum login.
 */
export async function VerifyEmailBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerifiedAt) return null;
  return (
    <Alert tone="warning" className="mt-6" title="Email belum diverifikasi">
      Verifikasi <b className="text-ink">{user.email}</b> supaya semua fitur akun terbuka.{" "}
      <Link href="/verifikasi-email" className="font-semibold underline">
        Kirim link verifikasi
      </Link>
    </Alert>
  );
}

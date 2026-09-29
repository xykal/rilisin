import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isStaff, type CurrentUser } from "./current-user";

export type SellerUser = CurrentUser & { seller: NonNullable<CurrentUser["seller"]> };

/** Wajib login. Kalau belum, lempar ke halaman masuk lalu balik lagi ke `nextPath`. */
export async function requireUser(nextPath = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Toko sudah disetujui admin (pending/rejected dibuang ke halaman /seller yang menjelaskan statusnya). */
export function isApprovedSeller(user: Pick<CurrentUser, "seller"> | null | undefined): user is SellerUser {
  return (user?.seller as { status?: string } | null)?.status === "approved";
}

/** Wajib toko yang sudah disetujui admin. */
export async function requireSeller(nextPath = "/seller"): Promise<SellerUser> {
  const user = await requireUser(nextPath);
  if (!isApprovedSeller(user)) redirect("/seller");
  return user as SellerUser;
}

/** Admin/moderator wajib 2FA? (production: ya — set REQUIRE_STAFF_2FA=1). */
export function staffMfaRequired() {
  return process.env.REQUIRE_STAFF_2FA === "1";
}

/**
 * Khusus admin / moderator. User biasa dapat 404 (halaman admin tidak "kelihatan").
 * Kalau REQUIRE_STAFF_2FA=1, staf tanpa 2FA diarahkan mengaktifkan 2FA dulu.
 */
export async function requireStaff(nextPath = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (!isStaff(user)) notFound();
  if (staffMfaRequired() && !user.mfaEnabled) redirect("/akun/keamanan?wajib=2fa");
  return user;
}

export async function requireAdmin(nextPath = "/admin"): Promise<CurrentUser> {
  const user = await requireStaff(nextPath);
  if (user.role !== "admin") notFound();
  return user;
}

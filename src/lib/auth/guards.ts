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

/** Wajib sudah mengaktifkan toko. */
export async function requireSeller(nextPath = "/seller"): Promise<SellerUser> {
  const user = await requireUser(nextPath);
  if (!user.seller) redirect("/seller");
  return user as SellerUser;
}

/** Khusus admin / moderator. User biasa dapat 404 (halaman admin tidak "kelihatan"). */
export async function requireStaff(nextPath = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (!isStaff(user)) notFound();
  return user;
}

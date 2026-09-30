import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin-tabs";
import { requireStaff } from "@/lib/auth/guards";
import { getModerationCounts } from "@/lib/moderation";
import { financeCounts } from "@/lib/payments/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff("/admin");
  const [counts, finance] = await Promise.all([getModerationCounts(), user.role === "admin" ? financeCounts() : Promise.resolve(null)]);
  return (
    <>
      <AdminTabs reviews={counts.reviews} reports={counts.reports} contentReports={counts.contentReports} finance={finance ? finance.total : null} sellers={user.role === "admin" ? counts.sellers : null} members={user.role === "admin" ? 0 : null} />
      {children}
    </>
  );
}

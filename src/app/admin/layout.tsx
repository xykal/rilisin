import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin-tabs";
import { requireStaff } from "@/lib/auth/guards";
import { getModerationCounts } from "@/lib/moderation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireStaff("/admin");
  const counts = await getModerationCounts();
  return (
    <>
      <AdminTabs reviews={counts.reviews} reports={counts.reports} />
      {children}
    </>
  );
}

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";

export default async function AdminIndex() {
  await requireStaff("/admin");
  redirect("/admin/review");
}

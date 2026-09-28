import { AtSign, Banknote, CheckCircle2, MessageCircle, MessagesSquare, Newspaper, PackageCheck, PackagePlus, PackageX, ReceiptText, RefreshCw, Star, UserPlus, Wallet, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./ui";

const MAP: Record<string, { icon: LucideIcon; tone: string }> = {
  order_paid: { icon: ReceiptText, tone: "bg-emerald-50 text-emerald-600" },
  sale: { icon: Banknote, tone: "bg-emerald-50 text-emerald-600" },
  payout_paid: { icon: Wallet, tone: "bg-emerald-50 text-emerald-600" },
  payout_rejected: { icon: XCircle, tone: "bg-red-50 text-red-600" },
  product_approved: { icon: PackageCheck, tone: "bg-brand-50 text-brand-600" },
  product_rejected: { icon: PackageX, tone: "bg-amber-50 text-amber-600" },
  review_new: { icon: Star, tone: "bg-amber-50 text-amber-500" },
  review_reply: { icon: Star, tone: "bg-amber-50 text-amber-500" },
  forum_reply: { icon: MessageCircle, tone: "bg-sky-50 text-sky-600" },
  forum_mention: { icon: AtSign, tone: "bg-violet-50 text-violet-600" },
  forum_accepted: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
  chat_reply: { icon: MessagesSquare, tone: "bg-sky-50 text-sky-600" },
  chat_mention: { icon: AtSign, tone: "bg-violet-50 text-violet-600" },
  product_update: { icon: RefreshCw, tone: "bg-brand-50 text-brand-600" },
  product_new: { icon: PackagePlus, tone: "bg-brand-50 text-brand-600" },
  product_devlog: { icon: Newspaper, tone: "bg-sky-50 text-sky-600" },
  new_follower: { icon: UserPlus, tone: "bg-violet-50 text-violet-600" },
};

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const m = MAP[type] ?? { icon: MessageCircle, tone: "bg-slate-100 text-slate-500" };
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", m.tone, className)} aria-hidden="true">
      <m.icon className="h-4 w-4" />
    </span>
  );
}

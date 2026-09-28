import { BellPlus, BellRing, Check, UserPlus } from "lucide-react";
import Link from "next/link";
import { followAction } from "@/app/actions/follows";
import { formatCompact } from "@/lib/format";
import { SubmitButton } from "./submit-button";
import { cn } from "./ui";

/**
 * Tombol Ikuti (seller) / Ikuti update (produk). Tamu diarahkan masuk; pemilik/diri sendiri hanya melihat jumlah pengikut.
 * Form biasa → jalan tanpa JavaScript.
 */
export function FollowButton({
  targetType,
  targetId,
  following,
  count,
  path,
  state,
  className,
  compact,
}: {
  targetType: "seller" | "product";
  targetId: string;
  following: boolean;
  count: number;
  /** Halaman yang di-revalidate setelah klik. */
  path: string;
  state: "can" | "guest" | "self";
  className?: string;
  compact?: boolean;
}) {
  const label = targetType === "seller" ? (following ? "Mengikuti" : "Ikuti") : following ? "Mengikuti update" : "Ikuti update";
  const Icon = targetType === "seller" ? (following ? Check : UserPlus) : following ? BellRing : BellPlus;
  const countText = `${formatCompact(count)} pengikut`;
  if (state === "self") {
    return <span className={cn("text-sm text-slate-500", className)}>{countText}</span>;
  }
  if (state === "guest") {
    return (
      <span className={cn("flex flex-wrap items-center gap-2", className)}>
        <Link href={`/masuk?next=${encodeURIComponent(path)}`} className={cn("inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50", compact && "!px-2.5 !py-1.5 !text-xs")}>
          <Icon className="h-4 w-4" /> {label}
        </Link>
        <span className="text-xs text-slate-500">{countText}</span>
      </span>
    );
  }
  return (
    <form action={followAction} className={cn("flex flex-wrap items-center gap-2", className)} data-follow={targetType}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="path" value={path} />
      <SubmitButton
        variant={following ? "secondary" : "primary"}
        className={cn(compact && "!px-2.5 !py-1.5 !text-xs", following && "!border-brand-200 !bg-brand-50 !text-brand-700")}
        pendingText="…"
      >
        <Icon className="h-4 w-4" /> {label}
      </SubmitButton>
      <span className="text-xs text-slate-500">{countText}</span>
    </form>
  );
}

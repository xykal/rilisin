import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { formatRupiah, initials } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { Badge, cn } from "./ui";

const AVATAR_COLORS = [
  "from-violet-500 to-indigo-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-fuchsia-500 to-purple-600",
];

function colorFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  avatarKey,
  size = 36,
  className,
}: {
  name: string;
  avatarKey?: string | null;
  size?: number;
  className?: string;
}) {
  const src = mediaUrl(avatarKey);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
        colorFor(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function ProductIcon({
  iconKey,
  title,
  size = 56,
  className,
}: {
  iconKey: string | null;
  title: string;
  size?: number;
  className?: string;
}) {
  const src = mediaUrl(iconKey);
  const radius = Math.round(size * 0.22);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Ikon ${title}`}
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 bg-slate-100 object-cover ring-1 ring-black/5", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-extrabold text-white", colorFor(title), className)}
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.36 }}
    >
      {initials(title)}
    </span>
  );
}

export function PriceTag({
  pricingModel,
  priceIdr,
  minPriceIdr,
  className,
}: {
  pricingModel: "free" | "fixed" | "pwyw";
  priceIdr: number;
  minPriceIdr: number;
  className?: string;
}) {
  if (pricingModel === "free") {
    return <span className={cn("font-bold text-emerald-600", className)}>Gratis</span>;
  }
  if (pricingModel === "pwyw") {
    return (
      <span className={cn("font-bold text-ink", className)}>
        {minPriceIdr > 0 ? `Mulai ${formatRupiah(minPriceIdr)}` : "Bayar seikhlasnya"}
      </span>
    );
  }
  return <span className={cn("font-bold text-ink", className)}>{formatRupiah(priceIdr)}</span>;
}

export function ProductStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "slate" | "brand" | "green" | "amber" | "red"; label: string }> = {
    draft: { tone: "slate", label: "Draft" },
    review: { tone: "amber", label: "Menunggu review" },
    published: { tone: "green", label: "Tayang" },
    rejected: { tone: "red", label: "Perlu perbaikan" },
    suspended: { tone: "red", label: "Ditangguhkan" },
  };
  const s = map[status] ?? { tone: "slate" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function AndroidBadge({
  registration,
  checked,
  size = "md",
}: {
  registration: "registered" | "not_registered" | null;
  checked?: boolean;
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  if (registration === "registered" && checked) {
    return (
      <Badge tone="green">
        <ShieldCheck className={cls} /> Developer terdaftar
      </Badge>
    );
  }
  if (registration === "registered") {
    return (
      <Badge tone="blue">
        <ShieldQuestion className={cls} /> Terdaftar (klaim developer)
      </Badge>
    );
  }
  if (registration === "not_registered") {
    return (
      <Badge tone="amber">
        <ShieldAlert className={cls} /> Perlu mode lanjutan
      </Badge>
    );
  }
  return null;
}

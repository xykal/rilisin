import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonBase =
  // HP (< 640px): label panjang boleh turun baris daripada meluber keluar tombol
  "inline-flex items-center justify-center gap-2 rounded-xl text-center text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap max-sm:whitespace-normal";

export const buttonStyles = {
  primary: `${buttonBase} bg-brand-600 px-4 py-2.5 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700`,
  secondary: `${buttonBase} border border-slate-300 bg-white px-4 py-2.5 text-slate-800 hover:bg-slate-50`,
  ghost: `${buttonBase} px-3 py-2 text-slate-700 hover:bg-slate-100`,
  danger: `${buttonBase} border border-red-200 bg-white px-4 py-2.5 text-red-700 hover:bg-red-50`,
  success: `${buttonBase} bg-emerald-600 px-4 py-2.5 text-white shadow-sm hover:bg-emerald-700`,
  small: "!px-3 !py-1.5 !text-xs !rounded-lg",
};

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={cn(buttonStyles[variant], className)} {...props} />;
}

export const inputStyles =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: "slate" | "brand" | "green" | "amber" | "red" | "blue";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    brand: "bg-brand-50 text-brand-700 ring-brand-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">(opsional)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title ? "mt-1" : "", "opacity-90")}>{children}</div>}
    </div>
  );
}

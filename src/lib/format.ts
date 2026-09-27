const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** 49000 -> "Rp49.000" */
export function formatRupiah(value: number) {
  return rupiah.format(value).replace(/\s/g, "");
}

/** 1234 -> "1,2 rb" */
export function formatCompact(value: number) {
  return compact.format(value);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  return dateFmt.format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "-";
  return dateTimeFmt.format(new Date(date));
}

/** Waktu sekian milidetik yang lalu (helper di luar render agar mudah dites). */
export function msAgo(ms: number) {
  return new Date(Date.now() - ms);
}

export function isWithin(date: Date | string, ms: number) {
  return Date.now() - new Date(date).getTime() < ms;
}

/** "3 hari yang lalu" */
export function timeAgo(date: Date | string | null | undefined) {
  if (!date) return "-";
  const diffSec = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "baru saja";
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2592000],
    ["year", 31536000],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let size = 60;
  for (const [u, s] of steps) {
    if (abs >= s) {
      unit = u;
      size = s;
    }
  }
  return rtf.format(Math.round(diffSec / size), unit);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

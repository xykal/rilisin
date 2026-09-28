"use client";

import { Flag } from "lucide-react";
import { useActionState } from "react";
import { reportContentAction } from "@/app/actions/reports";
import { CONTENT_REPORT_REASONS, REASONS_BY_TARGET, type ContentTargetType } from "@/lib/community/shared";
import { SubmitButton } from "./submit-button";
import { Alert, cn, inputStyles } from "./ui";

/** Tombol "Laporkan" + formulir alasan (pakai <details>, jalan tanpa JavaScript juga). */
export function ReportDialog({
  targetType,
  targetId,
  className,
  label = "Laporkan",
  align = "right",
}: {
  targetType: ContentTargetType;
  targetId: string;
  className?: string;
  label?: string;
  align?: "right" | "left";
}) {
  const [state, action] = useActionState(reportContentAction, undefined);
  const allowed = REASONS_BY_TARGET[targetType];
  const reasons = CONTENT_REPORT_REASONS.filter((r) => allowed.includes(r.id));
  return (
    <details className={cn("group relative", className)}>
      <summary className="-my-1 flex cursor-pointer list-none items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 [&::-webkit-details-marker]:hidden">
        <Flag className="h-3.5 w-3.5" /> {label}
      </summary>
      <div className={cn("absolute z-20 mt-2 w-[min(20rem,calc(100vw_-_2.5rem))] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl", align === "right" ? "right-0" : "left-0")}>
        {state?.success ? (
          <Alert tone="success">{state.success}</Alert>
        ) : (
          <form action={action} className="space-y-3" data-form="report" data-target={targetType}>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <p className="text-sm font-semibold text-ink">Kenapa dilaporkan?</p>
            {state?.error && <Alert tone="danger">{state.error}</Alert>}
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {reasons.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="radio" name="reason" value={r.id} required className="h-4 w-4 accent-brand-600" />
                  {r.label}
                </label>
              ))}
            </div>
            <label className="sr-only" htmlFor={`note-${targetId}`}>
              Catatan untuk moderator
            </label>
            <textarea id={`note-${targetId}`} name="note" rows={2} maxLength={500} className={inputStyles} placeholder="Catatan untuk moderator (opsional)" />
            <SubmitButton variant="danger" className="w-full !py-2" pendingText="Mengirim…">
              Kirim laporan
            </SubmitButton>
            <p className="text-[11px] leading-snug text-slate-400">Laporan palsu berulang bisa membuat akunmu dibatasi.</p>
          </form>
        )}
      </div>
    </details>
  );
}

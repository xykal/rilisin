"use client";

import { useActionState } from "react";
import { saveNotificationPrefsAction, sendTestEmailAction } from "@/app/actions/notifications";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/notifications/shared";
import { SubmitButton } from "./submit-button";
import { Alert } from "./ui";

export function NotificationPrefsForm({ prefs }: { prefs: Record<NotificationCategory, boolean> }) {
  const [state, action] = useActionState(saveNotificationPrefsAction, undefined);
  return (
    <form action={action} className="space-y-4" data-form="notif-prefs">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-4 p-4">
              <input type="checkbox" name={`email_${c.id}`} defaultChecked={prefs[c.id]} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">Email: {c.label}</span>
                <span className="block text-sm text-slate-500">{c.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <SubmitButton pendingText="Menyimpan…">Simpan pengaturan</SubmitButton>
    </form>
  );
}

export function TestEmailForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(sendTestEmailAction, undefined);
  return (
    <form action={action} className="space-y-3" data-form="test-email">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton variant="secondary" disabled={!enabled} pendingText="Mengirim…">
        Kirim email uji
      </SubmitButton>
    </form>
  );
}

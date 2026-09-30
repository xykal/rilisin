"use client";

import { useActionState } from "react";
import { createApiKeyAction } from "@/app/actions/api-keys";
import { API_SCOPES, SCOPE_LABELS, type ApiScope } from "@/lib/api-keys";
import { SubmitButton } from "./submit-button";
import { Alert, Field, inputStyles } from "./ui";

/** Form bikin API key. Scope yang tidak sesuai peran di-disable + dijelaskan. Secret tampil sekali di respons. */
export function ApiKeyForm({ allowed }: { allowed: ApiScope[] }) {
  const [state, action] = useActionState(createApiKeyAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const secret = state?.success?.match(/rsk_[A-Za-z0-9_-]+/)?.[0];
  return (
    <form action={action} data-form="apikey-create" className="grid gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {secret && (
        <Alert tone="success">
          <span className="block font-bold">API key dibuat — salin sekarang, tidak akan ditampilkan lagi:</span>
          <code className="mt-2 block break-all rounded-lg bg-emerald-100 px-3 py-2 font-mono text-sm">{secret}</code>
        </Alert>
      )}
      <Field label="Nama key" htmlFor="name" error={fe.name} hint="Contoh: Agen Claude, Bot stok, n8n sinkronisasi">
        <input id="name" name="name" required maxLength={60} defaultValue={state?.values?.name} className={inputStyles} placeholder="Agen Claude" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink">Scope (hak akses key ini)</legend>
        <div className="grid gap-2">
          {API_SCOPES.map((s) => {
            const ok = allowed.includes(s);
            return (
              <label key={s} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${ok ? "border-slate-200 bg-white" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"}`}>
                <input type="checkbox" name="scopes" value={s} disabled={!ok} defaultChecked={ok && s !== "admin:read"} className="h-4 w-4 accent-violet-600" />
                <span>
                  <span className="block font-mono text-xs font-bold">{s}</span>
                  <span className="block text-xs">{ok ? SCOPE_LABELS[s] : s.startsWith("seller:") ? "Butuh toko yang sudah disetujui" : "Butuh peran moderator/admin"}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Kedaluwarsa" htmlFor="expires">
        <select id="expires" name="expires" defaultValue="never" className={inputStyles}>
          <option value="never">Tidak pernah (cabut manual)</option>
          <option value="30d">30 hari</option>
          <option value="90d">90 hari</option>
        </select>
      </Field>
      <SubmitButton pendingText="Membuat key…">Buat API key</SubmitButton>
    </form>
  );
}

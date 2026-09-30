"use client";

import { useActionState } from "react";
import { createGroupAction } from "@/app/actions/groups";
import { SubmitButton } from "../submit-button";
import { Alert, Field, inputStyles } from "../ui";

/** Form bikin grup chat baru (publik atau privat + invite link). */
export function GroupForm() {
  const [state, action] = useActionState(createGroupAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Nama grup" htmlFor="name" error={fe.name} hint="2–40 karakter. Contoh: Wibu Ngoding, Sambat Production">
        <input id="name" name="name" required maxLength={40} defaultValue={state?.values?.name} className={inputStyles} placeholder="Nama grup" />
      </Field>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
        <Field label="Emoji" htmlFor="emoji" error={fe.emoji}>
          <input id="emoji" name="emoji" maxLength={8} defaultValue={state?.values?.emoji} className={`${inputStyles} text-center`} placeholder="💬" />
        </Field>
        <Field label="Deskripsi singkat" htmlFor="description" error={fe.description}>
          <input id="description" name="description" maxLength={200} defaultValue={state?.values?.description} className={inputStyles} placeholder="Grup buat apa? (opsional)" />
        </Field>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <input type="checkbox" name="isPrivate" value="on" className="mt-1 h-4 w-4 accent-violet-600" />
        <span>
          <span className="block text-sm font-bold text-ink">Grup privat 🔒</span>
          <span className="mt-0.5 block text-sm text-slate-600">
            Sembunyi dari daftar publik — orang cuma bisa gabung lewat link undangan khusus yang bisa kamu bagikan.
          </span>
        </span>
      </label>
      <SubmitButton pendingText="Membuat grup…">Buat grup</SubmitButton>
    </form>
  );
}

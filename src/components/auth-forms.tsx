"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";
import { Alert, Field, inputStyles } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Email atau username" htmlFor="identifier">
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          defaultValue={state?.values?.identifier}
          className={inputStyles}
          placeholder="nama@email.com"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputStyles} />
      </Field>
      <SubmitButton className="w-full !py-3" pendingText="Memeriksa…">
        Masuk
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">
        Belum punya akun?{" "}
        <Link href={`/daftar${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
          Daftar gratis
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action] = useActionState(registerAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Nama tampilan" htmlFor="displayName" error={fe.displayName}>
        <input id="displayName" name="displayName" required maxLength={50} defaultValue={state?.values?.displayName} className={inputStyles} placeholder="Budi Santoso" />
      </Field>
      <Field label="Username" htmlFor="username" error={fe.username} hint="Dipakai untuk profil publik: /@username">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
          <input
            id="username"
            name="username"
            required
            maxLength={20}
            autoComplete="username"
            defaultValue={state?.values?.username}
            className={`${inputStyles} pl-8`}
            placeholder="budidev"
          />
        </div>
      </Field>
      <Field label="Email" htmlFor="email" error={fe.email}>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={state?.values?.email} className={inputStyles} placeholder="nama@email.com" />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="Minimal 8 karakter">
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputStyles} />
      </Field>
      <SubmitButton className="w-full !py-3" pendingText="Membuat akun…">
        Buat akun
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">
        Dengan mendaftar, kamu setuju dengan Syarat &amp; Ketentuan dan Kebijakan Privasi (versi final disusun sebelum launch).
      </p>
      <p className="text-center text-sm text-slate-500">
        Sudah punya akun?{" "}
        <Link href={`/masuk${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}

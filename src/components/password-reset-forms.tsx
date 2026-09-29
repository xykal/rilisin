"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestResetAction, resetPasswordAction } from "@/app/actions/password-reset";
import { Honeypot } from "./auth-forms";
import { SubmitButton } from "./submit-button";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile-widget";
import { Alert, Field, inputStyles } from "./ui";

export function ForgotPasswordForm({ formToken, turnstile = null }: { formToken: string; turnstile?: { siteKey: string } | null }) {
  const [state, action] = useActionState(requestResetAction, undefined);
  if (state?.success) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Cek email kamu">
          {state.success}
        </Alert>
        <p className="text-center text-sm text-slate-500">
          <Link href="/masuk" className="font-semibold text-brand-700 hover:underline">
            Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="relative space-y-4" data-form="forgot-password">
      <input type="hidden" name="ft" value={formToken} />
      <Honeypot />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Email akun" htmlFor="email" error={state?.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} className={inputStyles} placeholder="nama@email.com" />
      </Field>
      {turnstile && <TurnstileWidget siteKey={turnstile.siteKey} action="lupa-password" resetKey={state} />}
      <SubmitButton className="w-full !py-3" pendingText="Mengirim…">
        Kirim link reset
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">
        Ingat password?{" "}
        <Link href="/masuk" className="font-semibold text-brand-700 hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ username }: { username: string }) {
  const [state, action] = useActionState(resetPasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" data-form="reset-password">
      {/* Bantu password manager menyimpan password baru untuk akun yang benar */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Password baru" htmlFor="password" error={fe.password} hint="Minimal 10 karakter, bukan password umum, tidak mengandung username/email.">
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} maxLength={200} />
      </Field>
      <Field label="Ulangi password baru" htmlFor="confirm" error={fe.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={10} maxLength={200} />
      </Field>
      <SubmitButton className="w-full !py-3" pendingText="Menyimpan…">
        Simpan password baru
      </SubmitButton>
    </form>
  );
}

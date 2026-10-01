"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";
import { NameCheckInput } from "./name-check-input";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile-widget";
import { Alert, Field, inputStyles } from "./ui";

/** Input jebakan bot: tidak terlihat manusia, tapi sering diisi bot otomatis. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

export type TurnstileProps = { siteKey: string } | null;

/** Logo Google resmi (4 warna) — dipakai hanya untuk tombol masuk dengan Google. */
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Tombol masuk dengan Google. Sengaja berupa <Link> biasa, bukan <form>: alurnya
 * butuh redirect penuh ke Google (307 + cookie state), bukan POST ke server sendiri.
 * Hanya dirender kalau deploy ini memang mengaktifkan Google OAuth.
 */
export function GoogleLoginLink({ next, label = "Lanjutkan dengan Google" }: { next: string; label?: string }) {
  const href = `/api/auth/google${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <Link
      href={href}
      // prefetch MATI: route ini 307 ke accounts.google.com — prefetch Next mengikuti redirect
      // itu (fetch lintas-origin) lalu diblokir CSP connect-src → console merah tiap buka /masuk.
      prefetch={false}
      data-testid="google-login"
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <GoogleIcon />
      {label}
    </Link>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
      <span className="h-px flex-1 bg-slate-200" />
      atau
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function LoginForm({ next, turnstile = null, challenge = false, google = false }: { next: string; turnstile?: TurnstileProps; challenge?: boolean; google?: boolean }) {
  const [state, action] = useActionState(loginAction, undefined);
  const showChallenge = Boolean(turnstile) && (challenge || state?.challenge);
  return (
    <form action={action} className="relative space-y-4">
      <input type="hidden" name="next" value={next} />
      <Honeypot />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {google && (
        <>
          <GoogleLoginLink next={next} />
          <OrDivider />
        </>
      )}
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
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <p className="-mt-2 text-right text-sm">
        <Link href="/lupa-password" className="font-medium text-brand-700 hover:underline">
          Lupa password?
        </Link>
      </p>
      {showChallenge && turnstile && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Terlalu banyak percobaan gagal dari jaringan ini — selesaikan verifikasi dulu.</p>
          <TurnstileWidget siteKey={turnstile.siteKey} action="masuk" resetKey={state} />
        </div>
      )}
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

export function RegisterForm({ next, formToken, turnstile = null, google = false }: { next: string; formToken: string; turnstile?: TurnstileProps; google?: boolean }) {
  const [state, action] = useActionState(registerAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="relative space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="ft" value={formToken} />
      <Honeypot />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {google && (
        <>
          <GoogleLoginLink next={next} label="Daftar dengan Google" />
          <OrDivider />
        </>
      )}
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
      <Field label="Password" htmlFor="password" error={fe.password} hint="Minimal 10 karakter, jangan pakai password yang sama dengan akun lain">
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} maxLength={200} />
      </Field>
      {turnstile && <TurnstileWidget siteKey={turnstile.siteKey} action="daftar" resetKey={state} />}
      <SubmitButton className="w-full !py-3" pendingText="Membuat akun…">
        Buat akun
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">
        Dengan mendaftar, kamu setuju dengan{" "}
        <Link href="/ketentuan" className="font-medium text-brand-700 hover:underline">Syarat &amp; Ketentuan</Link> dan{" "}
        <Link href="/privasi" className="font-medium text-brand-700 hover:underline">Kebijakan Privasi</Link>.
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

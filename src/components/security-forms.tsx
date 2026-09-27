"use client";

import { Check, Copy, Download, KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { verifyMfaAction } from "@/app/actions/auth";
import {
  changePasswordAction,
  confirmTotpSetupAction,
  disableTotpAction,
  regenerateRecoveryCodesAction,
  type RecoveryState,
} from "@/app/actions/security";
import { SubmitButton } from "./submit-button";
import { Alert, buttonStyles, cn, Field, inputStyles } from "./ui";

const codeInput = `${inputStyles} text-center font-mono text-2xl tracking-[0.35em]`;

export function MfaVerifyForm() {
  const [state, action] = useActionState(verifyMfaAction, undefined);
  const [useRecovery, setUseRecovery] = useState(false);
  if (state?.values?.expired) {
    return (
      <div className="space-y-4 text-center">
        <Alert tone="danger">{state.error}</Alert>
        <Link href="/masuk" className={cn(buttonStyles.primary, "w-full")}>
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field
        label={useRecovery ? "Kode cadangan" : "Kode 6 digit dari aplikasi authenticator"}
        htmlFor="code"
        hint={useRecovery ? "Format xxxxx-xxxxx. Setiap kode cadangan hanya bisa dipakai sekali." : "Buka Google Authenticator / Authy / 1Password, lalu masukkan kode untuk Rilisin."}
      >
        {useRecovery ? (
          <input id="code" name="code" required autoComplete="off" autoCapitalize="none" spellCheck={false} className={`${inputStyles} text-center font-mono text-lg tracking-widest`} placeholder="abcde-12345" />
        ) : (
          <input id="code" name="code" required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" autoFocus className={codeInput} placeholder="000000" />
        )}
      </Field>
      <SubmitButton className="w-full !py-3" pendingText="Memverifikasi…">
        Verifikasi &amp; masuk
      </SubmitButton>
      <button type="button" onClick={() => setUseRecovery((v) => !v)} className="w-full text-center text-sm font-semibold text-brand-700 hover:underline">
        {useRecovery ? "Pakai kode dari aplikasi authenticator" : "HP hilang? Pakai kode cadangan"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" key={state?.success}>
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Password saat ini" htmlFor="currentPassword" error={fe.currentPassword}>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={inputStyles} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Password baru" htmlFor="newPassword" error={fe.newPassword} hint="Min. 10 karakter, bukan password umum">
          <input id="newPassword" name="newPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className={inputStyles} />
        </Field>
        <Field label="Ulangi password baru" htmlFor="confirmPassword" error={fe.confirmPassword}>
          <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className={inputStyles} />
        </Field>
      </div>
      <SubmitButton pendingText="Menyimpan…">Ganti password</SubmitButton>
    </form>
  );
}

export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Kode cadangan 2FA Rilisin (masing-masing sekali pakai)\n\n${codes.join("\n")}\n`;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="flex items-center gap-2 font-bold text-amber-900">
        <KeyRound className="h-5 w-5" /> Simpan kode cadangan ini sekarang
      </p>
      <p className="mt-1 text-sm text-amber-900/80">
        Dipakai kalau HP kamu hilang. Kode hanya ditampilkan <b>sekali</b> — simpan di password manager atau cetak.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-[15px] text-ink">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-amber-200">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(buttonStyles.secondary, buttonStyles.small)}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {}
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Tersalin" : "Salin"}
        </button>
        <a
          className={cn(buttonStyles.secondary, buttonStyles.small)}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="kode-cadangan-rilisin.txt"
        >
          <Download className="h-3.5 w-3.5" /> Unduh .txt
        </a>
      </div>
    </div>
  );
}

export function ConfirmTotpForm({ enabled = false }: { enabled?: boolean }) {
  const [state, action] = useActionState<RecoveryState, FormData>(confirmTotpSetupAction, undefined);
  if (enabled && !state?.codes) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="2FA sudah aktif di akunmu" />
        <Link href="/akun/keamanan" className={buttonStyles.primary}>
          Kembali ke Keamanan akun
        </Link>
      </div>
    );
  }
  if (state?.codes) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="2FA berhasil diaktifkan 🎉">
          Mulai sekarang, setiap masuk akan diminta kode dari aplikasi authenticator. Perangkat lain yang sedang login sudah dikeluarkan.
        </Alert>
        <RecoveryCodes codes={state.codes} />
        <Link href="/akun/keamanan" className={buttonStyles.primary}>
          Saya sudah menyimpan kodenya
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Masukkan kode 6 digit dari aplikasi" htmlFor="code" error={state?.fieldErrors?.code}>
        <input id="code" name="code" required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" className={codeInput} placeholder="000000" />
      </Field>
      <SubmitButton className="w-full !py-3" pendingText="Memverifikasi…">
        Aktifkan 2FA
      </SubmitButton>
    </form>
  );
}

export function DisableTotpForm() {
  const [state, action] = useActionState(disableTotpAction, undefined);
  const fe = state?.fieldErrors ?? {};
  if (state?.success) return <Alert tone="warning">{state.success}</Alert>;
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Password saat ini" htmlFor="disable-password" error={fe.password}>
          <input id="disable-password" name="password" type="password" required autoComplete="current-password" className={inputStyles} />
        </Field>
        <Field label="Kode 2FA / kode cadangan" htmlFor="disable-code" error={fe.code}>
          <input id="disable-code" name="code" required autoComplete="one-time-code" className={inputStyles} placeholder="000000" />
        </Field>
      </div>
      <SubmitButton variant="danger" pendingText="Memproses…" confirm="Yakin mematikan 2FA? Akunmu jadi lebih mudah dibobol.">
        Matikan 2FA
      </SubmitButton>
    </form>
  );
}

export function RegenerateCodesForm() {
  const [state, action] = useActionState<RecoveryState, FormData>(regenerateRecoveryCodesAction, undefined);
  if (state?.codes) return <RecoveryCodes codes={state.codes} />;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <Field label="Password saat ini" htmlFor="regen-password" error={state?.fieldErrors?.password ?? state?.error}>
          <input id="regen-password" name="password" type="password" required autoComplete="current-password" className={inputStyles} />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Membuat…">
        Buat kode cadangan baru
      </SubmitButton>
    </form>
  );
}

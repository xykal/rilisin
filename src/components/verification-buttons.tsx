"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/form-state";
import { SubmitButton } from "./submit-button";
import { Alert } from "./ui";

/**
 * Tombol konfirmasi verifikasi email. Sengaja bukan form (tidak ada input), tapi tetap
 * butuh useActionState supaya hasilnya bisa ditampilkan di tempat.
 */
export function ConfirmVerificationButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <div className="space-y-3">
      {state?.success && (
        <Alert tone="success" title="Berhasil">
          {state.success}
        </Alert>
      )}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {!state?.success && (
        <form action={run}>
          <SubmitButton className="w-full !py-3" pendingText="Memverifikasi…">
            Verifikasi email saya
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

/** Tombol kirim ulang link verifikasi (dipakai juga sebagai banner di /akun). */
export function ResendVerificationButton({
  action,
  label = "Kirim ulang link verifikasi",
}: {
  action: (prev: FormState) => Promise<FormState>;
  label?: string;
}) {
  const [state, run] = useActionState(action, undefined);
  return (
    <div className="space-y-3">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <form action={run}>
        <SubmitButton className="w-full" variant="secondary" pendingText="Mengirim…">
          {label}
        </SubmitButton>
      </form>
    </div>
  );
}

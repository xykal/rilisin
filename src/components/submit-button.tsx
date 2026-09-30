"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { buttonStyles, cn } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
  name,
  value,
  confirm,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const [ask, setAsk] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAsk(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ask ]);

  return (
    <>
      <button
        ref={btnRef}
        type="submit"
        name={name}
        value={value}
        disabled={pending || disabled}
        className={cn(buttonStyles[variant], className)}
        onClick={(e) => {
          if (confirm) {
            e.preventDefault();
            setAsk(true);
          }
        }}
      >
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {pending && pendingText ? pendingText : children}
      </button>
      {ask &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-label="Konfirmasi"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAsk(false);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <p className="text-base font-extrabold text-ink">Yakin?</p>
              <p className="mt-1 text-sm text-slate-600">{confirm}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={cn(buttonStyles.secondary, buttonStyles.small)} onClick={() => setAsk(false)}>
                  Batal
                </button>
                <button
                  type="button"
                  autoFocus
                  className={cn(variant === "danger" ? buttonStyles.danger : buttonStyles.primary, buttonStyles.small)}
                  onClick={() => {
                    setAsk(false);
                    // requestSubmit(submitter) menjaga name/value tombol. Tanpa submitter, data tombol hilang.
                    const btn = btnRef.current;
                    if (btn?.form) btn.form.requestSubmit(btn);
                  }}
                >
                  Ya, lanjutkan
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn, inputStyles } from "./ui";

export type PickerOption = { value: string; label: ReactNode; disabled?: boolean };

/**
 * Dropdown custom pengganti <select> bawaan browser — dipakai di SEMUA form.
 * Nilai dikirim lewat <input type="hidden"> jadi server action tidak berubah sama sekali.
 * required bawaan browser sengaja tidak dipakai (validasi wajib tetap di server).
 * Bisa controlled (value + onChange) atau uncontrolled (defaultValue).
 */
export function Picker({
  name,
  id,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Pilih…",
  disabled,
  className,
  ariaLabel,
}: {
  name?: string;
  id?: string;
  options: PickerOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const pick = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
  };
  const currentLabel = options.find((o) => o.value === current)?.label;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={current} disabled={disabled} /> : null}
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(inputStyles, "flex items-center justify-between gap-2 text-left", !currentLabel && "text-slate-400")}
      >
        <span className="truncate">{currentLabel ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? "Pilihan"}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === current} aria-disabled={o.disabled}>
              <button
                type="button"
                disabled={o.disabled}
                onClick={() => pick(o.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100",
                  o.value === current ? "font-bold text-brand-700" : "text-slate-700",
                  o.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === current && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn, inputStyles } from "./ui";

/** Input password dengan tombol intip (mata). */
export function PasswordInput({
  id,
  name,
  autoComplete = "current-password",
  required = true,
  minLength,
  maxLength,
  className,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className={cn(inputStyles, "pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </span>
  );
}

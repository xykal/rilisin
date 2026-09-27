"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
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
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={cn(buttonStyles[variant], className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

import type { z } from "zod";

/** State standar untuk form yang memakai useActionState. */
export type FormState =
  | {
      error?: string;
      success?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    }
  | undefined;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { replyReviewAction, saveReviewAction } from "@/app/actions/reviews";
import { REVIEW_LIMITS } from "@/lib/community/shared";
import { SubmitButton } from "./submit-button";
import { Alert, cn, inputStyles } from "./ui";

const LABELS = ["", "Buruk", "Kurang", "Cukup", "Bagus", "Luar biasa"];

/** Pilih bintang: radio asli (bisa keyboard & pembaca layar), tampil sebagai bintang. */
export function StarRatingInput({ name, defaultValue, error }: { name: string; defaultValue?: number; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? 0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-slate-800">Rating</legend>
      <div className="flex flex-wrap items-center gap-3" onMouseLeave={() => setHover(0)}>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating 1 sampai 5 bintang">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer rounded-lg p-0.5 focus-within:ring-4 focus-within:ring-brand-100"
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name={name}
                value={n}
                required
                checked={value === n}
                onChange={() => setValue(n)}
                className="sr-only"
                aria-label={`${n} bintang — ${LABELS[n]}`}
              />
              <Star
                className={cn("h-8 w-8 transition-colors", n <= shown ? "text-amber-400" : "text-slate-200")}
                fill="currentColor"
                strokeWidth={0}
              />
            </label>
          ))}
        </div>
        <span className="text-sm font-medium text-slate-600" aria-live="polite">
          {shown ? LABELS[shown] : "Pilih bintang"}
        </span>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </fieldset>
  );
}

export function ReviewForm({
  productId,
  initial,
  onDoneLabel,
}: {
  productId: string;
  initial: { rating: number; body: string } | null;
  onDoneLabel?: string;
}) {
  const [state, action] = useActionState(saveReviewAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const [body, setBody] = useState(state?.values?.body ?? initial?.body ?? "");
  return (
    <form action={action} className="space-y-4" data-form="review">
      <input type="hidden" name="productId" value={productId} />
      {state?.error && !state.fieldErrors && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <StarRatingInput name="rating" defaultValue={Number(state?.values?.rating) || initial?.rating} error={fe.rating} />
      <div>
        <label htmlFor={`review-body-${productId}`} className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
          <span>
            Ceritakan pengalamanmu <span className="text-xs font-normal text-slate-400">(wajib untuk 1–2 bintang)</span>
          </span>
          <span className={cn("text-xs font-normal", body.length > REVIEW_LIMITS.bodyMax ? "text-red-600" : "text-slate-400")}>
            {body.length}/{REVIEW_LIMITS.bodyMax}
          </span>
        </label>
        <textarea
          id={`review-body-${productId}`}
          name="body"
          rows={4}
          maxLength={REVIEW_LIMITS.bodyMax}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputStyles}
          placeholder="Apa yang kamu suka? Ada bug atau yang kurang? Dipakai untuk apa?"
          aria-invalid={Boolean(fe.body)}
        />
        {fe.body ? (
          <p className="mt-1.5 text-xs font-medium text-red-600">{fe.body}</p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">Tanpa link. Ulasan jujur membantu pembeli lain dan seller memperbaiki karyanya.</p>
        )}
      </div>
      <SubmitButton pendingText="Menyimpan…">{onDoneLabel ?? (initial ? "Simpan perubahan" : "Kirim ulasan")}</SubmitButton>
    </form>
  );
}

export function SellerReplyForm({ reviewId, initial }: { reviewId: string; initial: string | null }) {
  const [state, action] = useActionState(replyReviewAction, undefined);
  return (
    <form action={action} className="mt-3 space-y-2" data-form="seller-reply">
      <input type="hidden" name="reviewId" value={reviewId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Balasan seller
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        rows={3}
        maxLength={REVIEW_LIMITS.replyMax}
        defaultValue={state?.values?.reply ?? initial ?? ""}
        className={inputStyles}
        placeholder="Tanggapi dengan sopan — terima kasih, klarifikasi, atau info perbaikan di versi berikutnya."
        required
      />
      <SubmitButton variant="secondary" className={cn("!text-xs")} pendingText="Menyimpan…">
        {initial ? "Perbarui balasan" : "Kirim balasan"}
      </SubmitButton>
    </form>
  );
}

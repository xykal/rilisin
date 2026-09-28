"use client";

import { useActionState, useState } from "react";
import { createThreadAction, replyAction, updateReplyAction, updateThreadAction } from "@/app/actions/forum";
import { FORUM_LIMITS } from "@/lib/community/shared";
import { Honeypot } from "../auth-forms";
import { SubmitButton } from "../submit-button";
import { Alert, Field, cn, inputStyles } from "../ui";

function MarkdownHint() {
  return (
    <p className="mt-1.5 text-xs text-slate-500">
      Bisa pakai Markdown: <code className="rounded bg-slate-100 px-1">**tebal**</code>, <code className="rounded bg-slate-100 px-1">`kode`</code>,{" "}
      <code className="rounded bg-slate-100 px-1">```blok kode```</code>, daftar <code className="rounded bg-slate-100 px-1">-</code>, dan{" "}
      <code className="rounded bg-slate-100 px-1">@username</code> untuk menyebut orang.
    </p>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={cn("text-xs font-normal", value.length > max ? "text-red-600" : "text-slate-400")}>{value.length.toLocaleString("id-ID")}/{max.toLocaleString("id-ID")}</span>;
}

export function ThreadForm({
  mode,
  categories,
  defaultCategoryId,
  formToken,
  product,
  thread,
}: {
  mode: "create" | "edit";
  categories: { id: string; name: string; emoji: string; description: string; disabled?: boolean }[];
  defaultCategoryId?: string;
  formToken?: string;
  product?: { id: string; title: string } | null;
  thread?: { id: string; title: string; body: string };
}) {
  const [state, action] = useActionState(mode === "create" ? createThreadAction : updateThreadAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const [title, setTitle] = useState(state?.values?.title ?? thread?.title ?? "");
  const [body, setBody] = useState(state?.values?.body ?? thread?.body ?? "");
  const [linkProduct, setLinkProduct] = useState(true);
  return (
    <form action={action} className="relative space-y-5" data-form={mode === "create" ? "new-thread" : "edit-thread"}>
      {formToken && <input type="hidden" name="ft" value={formToken} />}
      {thread && <input type="hidden" name="threadId" value={thread.id} />}
      {mode === "create" && <Honeypot />}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      {mode === "create" && (
        <Field label="Kategori" htmlFor="categoryId" error={fe.categoryId}>
          <select id="categoryId" name="categoryId" required defaultValue={state?.values?.categoryId || defaultCategoryId || ""} className={inputStyles}>
            <option value="" disabled>
              Pilih kategori…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} disabled={c.disabled}>
                {c.emoji} {c.name}
                {c.disabled ? " (khusus tim)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {mode === "create" && product && (
        <label className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand-600"
            checked={linkProduct}
            onChange={(e) => setLinkProduct(e.target.checked)}
          />
          <span>
            Tautkan ke produk <b className="text-ink">{product.title}</b> — thread muncul di bagian Diskusi halaman produknya.
          </span>
          {linkProduct && <input type="hidden" name="productId" value={product.id} />}
        </label>
      )}

      <div>
        <label htmlFor="title" className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
          <span>Judul</span>
          <Counter value={title} max={FORUM_LIMITS.titleMax} />
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={FORUM_LIMITS.titleMin}
          maxLength={FORUM_LIMITS.titleMax}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputStyles}
          placeholder="Contoh: APK Flutter release ukurannya 60 MB, cara mengecilkannya?"
          aria-invalid={Boolean(fe.title)}
        />
        {fe.title && <p className="mt-1.5 text-xs font-medium text-red-600">{fe.title}</p>}
      </div>

      <div>
        <label htmlFor="body" className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
          <span>Isi</span>
          <Counter value={body} max={FORUM_LIMITS.bodyMax} />
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={10}
          minLength={FORUM_LIMITS.bodyMin}
          maxLength={FORUM_LIMITS.bodyMax}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={cn(inputStyles, "font-[450]")}
          placeholder={"Jelaskan konteksnya: apa yang kamu coba, error yang muncul, versi yang dipakai.\nSemakin jelas, semakin cepat dijawab."}
          aria-invalid={Boolean(fe.body)}
        />
        {fe.body ? <p className="mt-1.5 text-xs font-medium text-red-600">{fe.body}</p> : <MarkdownHint />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Menyimpan…">{mode === "create" ? "Terbitkan thread" : "Simpan perubahan"}</SubmitButton>
        <p className="text-xs text-slate-500">Jaga sopan santun · tanpa SARA, spam, judol, atau link bajakan.</p>
      </div>
    </form>
  );
}

export function ReplyComposer({ threadId }: { threadId: string }) {
  const [state, action] = useActionState(replyAction, undefined);
  const [body, setBody] = useState(state?.values?.body ?? "");
  return (
    <form action={action} className="space-y-3" data-form="reply">
      <input type="hidden" name="threadId" value={threadId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <label htmlFor="reply-body" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
        <span>Tulis balasan</span>
        <Counter value={body} max={FORUM_LIMITS.replyMax} />
      </label>
      <textarea
        id="reply-body"
        name="body"
        required
        rows={5}
        maxLength={FORUM_LIMITS.replyMax}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={inputStyles}
        placeholder="Bantu jawab, bagikan pengalaman, atau sebut @username…"
      />
      <MarkdownHint />
      <SubmitButton pendingText="Mengirim…">Kirim balasan</SubmitButton>
    </form>
  );
}

export function EditReplyForm({ replyId, body: initial }: { replyId: string; body: string }) {
  const [state, action] = useActionState(updateReplyAction, undefined);
  const [body, setBody] = useState(state?.values?.body ?? initial);
  return (
    <form action={action} className="space-y-3" data-form="edit-reply">
      <input type="hidden" name="replyId" value={replyId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <label htmlFor="edit-reply-body" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
        <span>Isi balasan</span>
        <Counter value={body} max={FORUM_LIMITS.replyMax} />
      </label>
      <textarea
        id="edit-reply-body"
        name="body"
        required
        rows={8}
        maxLength={FORUM_LIMITS.replyMax}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={inputStyles}
      />
      <MarkdownHint />
      <SubmitButton pendingText="Menyimpan…">Simpan perubahan</SubmitButton>
    </form>
  );
}

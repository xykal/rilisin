"use client";

import { Check, ImagePlus, Loader2, Lock, LogIn, MicOff, Pencil, Reply, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHAT_LIMITS, snippet } from "@/lib/chat/shared";
import { cn } from "../ui";
import type { LocalMessage } from "./message-bubble";
import { nameColor, useMediaQuery } from "./utils";

export type PendingImage = { uploadId: string | null; url: string; w: number; h: number; progress: number; error?: string };

type Props = {
  roomSlug: string;
  disabled: null | { kind: "guest" | "announcement" | "muted"; text: string };
  replyTo: LocalMessage | null;
  editing: LocalMessage | null;
  viewerId: string | null;
  slowModeSec: number;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string, image: PendingImage | null) => Promise<boolean>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onTyping: () => void;
  onError: (msg: string) => void;
};

export function Composer(p: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<PendingImage | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const finePointer = useMediaQuery("(pointer: fine)");

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    // padding (9px atas + 9px bawah) sekarang ada di dalam textarea supaya seluruh "pil" bisa diketuk
    el.style.height = `${Math.min(el.scrollHeight, 166)}px`;
  };

  // Masuk mode edit → isi teks lama; keluar → kosongkan
  const editingId = p.editing?.id ?? null;
  useEffect(() => {
    if (editingId && p.editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron teks saat mulai edit
      setText(p.editing.body);
      requestAnimationFrame(() => {
        resize();
        taRef.current?.focus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (p.replyTo) taRef.current?.focus();
  }, [p.replyTo]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (p.disabled) {
    return (
      <div className="border-t border-slate-200 bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-center">
        {p.disabled.kind === "guest" ? (
          <Link href={`/masuk?next=${encodeURIComponent(`/komunitas/${p.roomSlug}`)}`} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            <LogIn className="h-4 w-4" /> {p.disabled.text}
          </Link>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
            {p.disabled.kind === "muted" ? <MicOff className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {p.disabled.text}
          </p>
        )}
      </div>
    );
  }

  const uploading = !!image && !image.uploadId && !image.error;
  const trimmed = text.trim();
  const tooLong = trimmed.length > CHAT_LIMITS.maxChars;
  const canSend = (!!trimmed || (!!image?.uploadId && !p.editing)) && !uploading && !tooLong && cooldown <= 0;

  async function submit() {
    if (!canSend) return;
    const body = text;
    if (p.editing) {
      const ok = await p.onEdit(p.editing.id, body);
      if (ok) {
        setText("");
        requestAnimationFrame(resize);
      }
      return;
    }
    const img = image;
    setText("");
    setImage(null);
    requestAnimationFrame(resize);
    const ok = await p.onSend(body, img);
    if (ok && p.slowModeSec > 0) setCooldown(p.slowModeSec);
  }

  function pickFile(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return p.onError("Hanya gambar PNG, JPG, atau WebP.");
    if (file.size > 25 * 1024 * 1024) return p.onError("Gambar maksimal 25 MB.");
    const localUrl = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setImage({ uploadId: null, url: localUrl, w: probe.naturalWidth, h: probe.naturalHeight, progress: 0 });
      // Foto HP modern 5–15 MB: kecilkan dulu di browser (maks 2048 px, JPEG) → upload cepat & lolos batas body server
      const big = file.size > 3 * 1024 * 1024 || Math.max(probe.naturalWidth, probe.naturalHeight) > 2048;
      if (!big) return sendImage(file);
      const scale = Math.min(1, 2048 / Math.max(probe.naturalWidth, probe.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(probe.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(probe.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return sendImage(file);
      ctx.fillStyle = "#ffffff"; // PNG transparan → latar putih (JPEG tidak punya alpha)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => sendImage(b && b.size < file.size ? b : file), "image/jpeg", 0.86);
    };
    const sendImage = (body: Blob) => {
      if (body.size > CHAT_LIMITS.imageMaxBytes) {
        setImage(null);
        return p.onError("Gambar terlalu besar.");
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/chat/uploads");
      xhr.setRequestHeader("Content-Type", body.type || file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setImage((cur) => (cur && cur.url === localUrl ? { ...cur, progress: e.loaded / e.total } : cur));
      };
      xhr.onload = () => {
        let data: { id?: string; w?: number; h?: number; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data.id) {
          setImage((cur) => (cur && cur.url === localUrl ? { ...cur, uploadId: data.id!, w: data.w ?? cur.w, h: data.h ?? cur.h, progress: 1 } : cur));
        } else {
          setImage(null);
          p.onError(data.error ?? "Upload gambar gagal.");
        }
      };
      xhr.onerror = () => {
        setImage(null);
        p.onError("Upload gambar gagal — cek koneksi.");
      };
      xhr.send(body);
    };
    probe.onerror = () => p.onError("Gambar tidak bisa dibaca.");
    probe.src = localUrl;
  }

  const banner = p.editing ?? p.replyTo;
  return (
    <div className="border-t border-slate-200/80 bg-white/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur sm:px-3">
      {banner && (
        <div className="anim-slide-up mb-2 flex items-center gap-2 rounded-2xl bg-slate-100 py-2 pl-3 pr-1.5">
          {p.editing ? <Pencil className="h-4 w-4 shrink-0 text-brand-600" /> : <Reply className="h-4 w-4 shrink-0 text-brand-600" />}
          <div className="min-w-0 flex-1 border-l-[3px] pl-2" style={{ borderColor: p.editing ? "#5b43f5" : nameColor(banner.author.id) }}>
            <p className="text-[12.5px] font-bold" style={{ color: p.editing ? "#4b34d9" : nameColor(banner.author.id) }}>
              {p.editing ? "Edit pesan" : `Membalas ${banner.author.id === p.viewerId ? "diri sendiri" : banner.author.displayName}`}
            </p>
            <p className="truncate text-[13px] text-slate-600">{banner.body ? snippet(banner.body, 100) : banner.image ? "📷 Foto" : ""}</p>
          </div>
          <button
            type="button"
            aria-label={p.editing ? "Batal edit" : "Batal membalas"}
            onClick={() => {
              if (p.editing) {
                setText("");
                p.onCancelEdit();
              } else p.onCancelReply();
            }}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {image && (
        <div className="anim-slide-up mb-2 flex items-center gap-3 rounded-2xl bg-slate-100 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" className="h-14 w-14 rounded-xl object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink">{image.uploadId ? "Gambar siap dikirim" : "Mengupload gambar…"}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.round(image.progress * 100)}%` }} />
            </div>
          </div>
          <button type="button" aria-label="Hapus gambar" onClick={() => setImage(null)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {!p.editing && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              aria-label="Kirim gambar"
              disabled={!!image}
              onClick={() => fileRef.current?.click()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40"
            >
              <ImagePlus className="h-[22px] w-[22px]" />
            </button>
          </>
        )}
        <div className={cn("flex min-w-0 flex-1 items-end rounded-[22px] border bg-white transition-colors", tooLong ? "border-red-300" : "border-slate-200 focus-within:border-brand-300")}>
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            maxLength={CHAT_LIMITS.maxChars + 200}
            placeholder={image ? "Tambahkan keterangan…" : "Ketik pesan"}
            aria-label="Ketik pesan"
            enterKeyHint={finePointer ? "send" : "enter"}
            onChange={(e) => {
              setText(e.target.value);
              resize();
              if (e.target.value.trim() && Date.now() - lastTyping.current > 2500) {
                lastTyping.current = Date.now();
                p.onTyping();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && finePointer) {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") {
                if (p.editing) {
                  setText("");
                  p.onCancelEdit();
                } else if (p.replyTo) p.onCancelReply();
              }
            }}
            className="block max-h-[166px] w-full resize-none rounded-[22px] bg-transparent px-3.5 py-[9px] text-[15px] leading-[22px] text-ink placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          aria-label={p.editing ? "Simpan edit" : "Kirim"}
          disabled={!canSend}
          onPointerDown={(e) => e.preventDefault() /* keyboard HP tidak tertutup */}
          onClick={() => void submit()}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95 disabled:bg-slate-300 disabled:shadow-none"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : cooldown > 0 ? (
            <span className="text-xs font-bold">{cooldown}</span>
          ) : p.editing ? (
            <Check className="h-5 w-5" />
          ) : (
            <SendHorizontal className="h-5 w-5" />
          )}
        </button>
      </div>
      {trimmed.length > CHAT_LIMITS.maxChars - 200 && (
        <p className={cn("mt-1 pr-12 text-right text-[11px]", tooLong ? "font-semibold text-red-600" : "text-slate-400")}>
          {trimmed.length.toLocaleString("id-ID")}/{CHAT_LIMITS.maxChars.toLocaleString("id-ID")}
        </p>
      )}
    </div>
  );
}

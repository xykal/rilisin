"use client";

import { CircleCheck, CloudUpload, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { Picker } from "./picker";
import { buttonStyles, cn } from "./ui";

type Purpose = "icon" | "cover" | "screenshot" | "release_file";

type Status =
  | { state: "idle" }
  | { state: "uploading"; name: string; progress: number; index: number; total: number }
  | { state: "processing"; name: string; index: number; total: number }
  | { state: "done"; message: string }
  | { state: "error"; message: string };

function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload gagal (HTTP ${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload. Coba lagi."));
    xhr.send(file);
  });
}

/**
 * Upload 3 langkah: minta izin (init) → kirim file langsung ke storage (PUT) → finalisasi (complete).
 * Dengan R2 nanti, langkah PUT langsung ke Cloudflare (server kita tidak ikut menanggung bandwidth).
 */
export function Uploader({
  purpose,
  targetId,
  accept,
  label,
  hint,
  multiple,
  platformOptions,
  disabled,
  compact,
}: {
  purpose: Purpose;
  targetId: string;
  accept: string;
  label: string;
  hint?: string;
  multiple?: boolean;
  platformOptions?: { value: string; label: string }[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [platform, setPlatform] = useState(platformOptions?.[0]?.value ?? "");
  const busy = status.state === "uploading" || status.state === "processing";

  async function uploadOne(file: File, index: number, total: number) {
    setStatus({ state: "uploading", name: file.name, progress: 0, index, total });
    const initRes = await fetch("/api/uploads/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, targetId, filename: file.name, size: file.size, platform: platform || undefined }),
    });
    const init = await initRes.json().catch(() => ({}));
    if (!initRes.ok) throw new Error(init.error ?? "Gagal memulai upload");

    await putWithProgress(init.uploadUrl, file, (progress) =>
      setStatus({ state: "uploading", name: file.name, progress, index, total }),
    );

    setStatus({ state: "processing", name: file.name, index, total });
    const doneRes = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: init.token }),
    });
    const done = await doneRes.json().catch(() => ({}));
    if (!doneRes.ok) throw new Error(done.error ?? "Gagal memproses file");
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    try {
      for (let i = 0; i < list.length; i++) await uploadOne(list[i]!, i + 1, list.length);
      setStatus({ state: "done", message: list.length > 1 ? `${list.length} file berhasil diupload` : "Berhasil diupload" });
      router.refresh();
    } catch (err) {
      setStatus({ state: "error", message: err instanceof Error ? err.message : "Upload gagal" });
      router.refresh();
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn(!compact && "rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        {platformOptions && platformOptions.length > 0 && (
          <Picker value={platform} onChange={setPlatform} disabled={busy || disabled} ariaLabel="Platform file" className="w-auto min-w-36" options={platformOptions} />
        )}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          className={cn(buttonStyles.secondary, "!py-2")}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          {label}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        {hint && status.state === "idle" && <span className="text-xs text-slate-500">{hint}</span>}
      </div>

      {status.state === "uploading" && (
        <div className="mt-3">
          <p className="truncate text-xs text-slate-600">
            {status.total > 1 && `(${status.index}/${status.total}) `}Mengupload {status.name} — {Math.round(status.progress * 100)}%
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${status.progress * 100}%` }} />
          </div>
        </div>
      )}
      {status.state === "processing" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Memeriksa &amp; memproses {status.name}…
        </p>
      )}
      {status.state === "done" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CircleCheck className="h-3.5 w-3.5" /> {status.message}
        </p>
      )}
      {status.state === "error" && (
        <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {status.message}
        </p>
      )}
    </div>
  );
}

export function FileSizeNote({ maxBytes }: { maxBytes: number }) {
  return <>Maks. {formatBytes(maxBytes)} per file</>;
}

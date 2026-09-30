"use client";

import { Loader2, Mic, Pause, Play, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAT_LIMITS } from "@/lib/chat/shared";
import { cn } from "../ui";

export type PendingAudio = { uploadId: string; url: string; secs: number };

export function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Dukungan rekam suara (MediaRecorder + izin mic). Safari lama / HTTP non-lokal → false. */
export function canRecordVoice() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && "MediaRecorder" in window;
}

/**
 * Panel rekam pesan suara: mulai otomatis saat tampil → stop → dengar ulang → kirim/hapus.
 * Upload terjadi saat tombol kirim ditekan (odonDone membawa uploadId siap tempel ke pesan).
 */
export function VoiceRecorder({
  onDone,
  onError,
  onCancel,
  onActive,
}: {
  onDone: (a: PendingAudio) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
  /** Dipanggil true saat rekaman BERJALAN, false saat berhenti/gagal — untuk indikator "merekam…". */
  onActive?: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<"recording" | "preview" | "uploading">("recording");
  const [secs, setSecs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cbRef = useRef({ onDone, onError, onCancel, onActive });
  // Sinkron callback terbaru ke ref (di effect, bukan saat render — aturan react-hooks/refs).
  useEffect(() => {
    cbRef.current = { onDone, onError, onCancel, onActive };
  });

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // ogg/opus dulu (Firefox, paling kecil) → webm/opus (Chrome/Edge) → mp4 (Safari). TIDAK PERNAH mp3.
        const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
        recRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          window.clearInterval(timerRef.current);
          stopTracks();
          cbRef.current.onActive?.(false);
          if (!alive) return;
          const type = (rec.mimeType.split(";")[0] || "audio/webm").trim();
          const b = new Blob(chunksRef.current, { type });
          setBlob(b);
          setBlobUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(b);
          });
          setPhase("preview");
        };
        rec.start();
        cbRef.current.onActive?.(true);
        const t0 = Date.now();
        timerRef.current = window.setInterval(() => {
          const s = Math.floor((Date.now() - t0) / 1000);
          setSecs(s);
          if (s >= CHAT_LIMITS.audioMaxSecs && recRef.current?.state === "recording") recRef.current.stop();
        }, 500);
      } catch {
        if (!alive) return;
        cbRef.current.onActive?.(false);
        cbRef.current.onError("Izin mikrofon ditolak — nyalakan dulu di pengaturan browser.");
        cbRef.current.onCancel();
      }
    })();
    return () => {
      alive = false;
      cbRef.current.onActive?.(false);
      window.clearInterval(timerRef.current);
      try {
        if (recRef.current?.state === "recording") recRef.current.stop();
      } catch {}
      stopTracks();
    };
    // mulai rekam sekali saat panel dibuka
  }, []);

  const stopRec = () => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play().catch(() => {});
  };

  const send = async () => {
    if (!blob || phase === "uploading") return;
    if (blob.size > CHAT_LIMITS.audioMaxBytes) {
      onError("Rekaman kebesaran (maks 5 MB) — coba yang lebih pendek.");
      return;
    }
    setPhase("uploading");
    try {
      const res = await fetch("/api/chat/uploads", {
        method: "POST",
        headers: { "content-type": blob.type || "audio/webm", "x-audio-secs": String(Math.max(1, Math.round(secs))) },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; secs?: number; error?: string };
      if (!res.ok || !data.id || !data.url) {
        setPhase("preview");
        onError(data.error ?? "Upload pesan suara gagal.");
        return;
      }
      onDone({ uploadId: data.id, url: data.url, secs: data.secs ?? Math.max(1, Math.round(secs)) });
    } catch {
      setPhase("preview");
      onError("Upload pesan suara gagal — cek koneksi.");
    }
  };

  return (
    <div className="anim-slide-up mb-2 flex items-center gap-2 rounded-2xl bg-slate-100 p-2">
      {phase === "recording" ? (
        <>
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
            <Mic className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-red-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tabular-nums text-ink">{fmtSecs(secs)}</p>
            <p className="truncate text-xs text-slate-500">Merekam… maks {fmtSecs(CHAT_LIMITS.audioMaxSecs)}</p>
          </div>
          <button type="button" aria-label="Hapus rekaman" onClick={onCancel} className="tap-hit rounded-full p-2 text-slate-500 hover:bg-slate-200">
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Berhenti & dengarkan"
            onClick={stopRec}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 active:scale-95"
          >
            <Pause className="h-5 w-5" />
          </button>
        </>
      ) : (
        <>
          {blobUrl && (
            <audio ref={audioRef} src={blobUrl} preload="metadata" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
          )}
          <button
            type="button"
            aria-label={playing ? "Jeda" : "Putar rekaman"}
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm hover:bg-brand-50"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tabular-nums text-ink">{fmtSecs(secs)}</p>
            <p className="truncate text-xs text-slate-500">{phase === "uploading" ? "Mengirim…" : "Dengar ulang sebelum kirim"}</p>
          </div>
          <button type="button" aria-label="Hapus rekaman" onClick={onCancel} disabled={phase === "uploading"} className="tap-hit rounded-full p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-40">
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Kirim pesan suara"
            onClick={() => void send()}
            disabled={phase === "uploading"}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 active:scale-95 disabled:bg-slate-300 disabled:shadow-none",
            )}
          >
            {phase === "uploading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </>
      )}
    </div>
  );
}

"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";
import { fmtSecs } from "./voice-recorder";

const PAUSE_OTHERS = "rilisin:voice-play";

/** Pemutar pesan suara custom (tanpa kontrol bawaan browser): putar/jeda + garis progres yang bisa diketuk. */
export function VoicePlayer({ url, secs, mine }: { url: string; secs: number; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(secs > 0 ? secs : 0);

  // Satu suara dalam satu waktu: pemain lain berhenti saat yang ini diputar.
  useEffect(() => {
    const el = audioRef.current;
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== url) el?.pause();
    };
    window.addEventListener(PAUSE_OTHERS, onOther);
    return () => window.removeEventListener(PAUSE_OTHERS, onOther);
  }, [url ]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else {
      window.dispatchEvent(new CustomEvent(PAUSE_OTHERS, { detail: url }));
      void el.play().catch(() => {});
    }
  };

  const seek = (clientX: number) => {
    const el = audioRef.current;
    const bar = barRef.current;
    if (!el || !bar || !dur) return;
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    el.currentTime = ratio * dur;
    setT(ratio * dur);
  };

  const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;
  return (
    <div className="flex w-56 max-w-full items-center gap-2" dir="ltr">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setT(0);
        }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
        }}
      />
      <button
        type="button"
        aria-label={playing ? "Jeda pesan suara" : "Putar pesan suara"}
        onClick={toggle}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95",
          mine ? "bg-white/25 text-white hover:bg-white/35" : "bg-brand-600 text-white hover:bg-brand-700",
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={barRef}
          role="slider"
          aria-label="Posisi putar"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          tabIndex={0}
          onClick={(e) => seek(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const el = audioRef.current;
              if (el && dur) el.currentTime = Math.min(dur, Math.max(0, el.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
            }
          }}
          className={cn("h-6 cursor-pointer py-2", mine ? "" : "")}
        >
          <div className={cn("relative h-1.5 overflow-visible rounded-full", mine ? "bg-white/30" : "bg-slate-200")}>
            <div className={cn("h-full rounded-full", mine ? "bg-white" : "bg-brand-500")} style={{ width: `${pct}%` }} />
            <div
              className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow", mine ? "bg-white" : "bg-brand-600")}
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
        <p className={cn("text-[11px] tabular-nums", mine ? "text-white/80" : "text-slate-500")}>
          {fmtSecs(t)} / {fmtSecs(dur)}
        </p>
      </div>
    </div>
  );
}

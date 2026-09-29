"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { SubmitButton } from "./submit-button";
import { Alert } from "./ui";

export function ProfileForm({ initial }: { initial: { displayName: string; bio: string; location: string; websiteUrl: string } }) {
  const [state, action] = useActionState(updateProfileAction, undefined);
  const v = state?.values;
  return (
    <form action={action} className="space-y-4" data-form="profil">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div>
        <label htmlFor="displayName" className="mb-1 block text-sm font-semibold text-ink">
          Nama tampil
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={v?.displayName ?? initial.displayName}
          maxLength={50}
          autoComplete="nickname"
          className="block min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base text-ink outline-none focus:border-brand-500"
        />
        {state?.fieldErrors?.displayName && <p className="mt-1 text-sm text-red-600">{state.fieldErrors.displayName}</p>}
      </div>
      <div>
        <label htmlFor="bio" className="mb-1 block text-sm font-semibold text-ink">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={300}
          defaultValue={v?.bio ?? initial.bio}
          placeholder="Ceritakan siapa kamu (maks 300 karakter)"
          className="block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-ink outline-none focus:border-brand-500"
        />
        {state?.fieldErrors?.bio && <p className="mt-1 text-sm text-red-600">{state.fieldErrors.bio}</p>}
      </div>
      <div>
        <label htmlFor="location" className="mb-1 block text-sm font-semibold text-ink">
          Lokasi
        </label>
        <input
          id="location"
          name="location"
          defaultValue={v?.location ?? initial.location}
          maxLength={80}
          autoComplete="address-level2"
          placeholder="mis. Yogyakarta"
          className="block min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base text-ink outline-none focus:border-brand-500"
        />
        {state?.fieldErrors?.location && <p className="mt-1 text-sm text-red-600">{state.fieldErrors.location}</p>}
      </div>
      <div>
        <label htmlFor="websiteUrl" className="mb-1 block text-sm font-semibold text-ink">
          Website
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={v?.websiteUrl ?? initial.websiteUrl}
          maxLength={200}
          placeholder="https://…"
          className="block min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base text-ink outline-none focus:border-brand-500"
        />
        {state?.fieldErrors?.websiteUrl && <p className="mt-1 text-sm text-red-600">{state.fieldErrors.websiteUrl}</p>}
      </div>
      <SubmitButton pendingText="Menyimpan…">Simpan profil</SubmitButton>
    </form>
  );
}

export function AvatarPanel({ currentUrl, username }: { currentUrl: string | null; username: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const upload = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ tone: "danger", text: "Hanya gambar PNG, JPG, atau WebP." });
    if (file.size > 4 * 1024 * 1024) return setMsg({ tone: "danger", text: "Foto maksimal 4 MB." });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) {
        setUrl(data.url);
        setMsg({ tone: "success", text: "Foto profil diganti." });
        router.refresh();
      } else {
        setMsg({ tone: "danger", text: data.error ?? "Upload gagal." });
      }
    } catch {
      setMsg({ tone: "danger", text: "Upload gagal — cek koneksi." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/avatar", { method: "DELETE" });
      if (res.ok) {
        setUrl(null);
        setMsg({ tone: "success", text: "Foto profil dihapus." });
        router.refresh();
      } else {
        setMsg({ tone: "danger", text: "Gagal menghapus." });
      }
    } catch {
      setMsg({ tone: "danger", text: "Gagal menghapus — cek koneksi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL avatar dinamis (driver storage apa pun)
          <img src={url} alt="Foto profil" width={96} height={96} className="h-24 w-24 rounded-full object-cover ring-4 ring-slate-100" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-3xl font-extrabold text-brand-700 ring-4 ring-slate-100">
            {(username[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Memproses…" : url ? "Ganti foto" : "Pilih foto"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex min-h-[44px] items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50"
            >
              Hapus
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">PNG/JPG/WebP maks 4 MB — otomatis dipotong persegi 256 px.</p>
    </div>
  );
}

export function CoverPanel({ currentUrl }: { currentUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const upload = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ tone: "danger", text: "Hanya gambar PNG, JPG, atau WebP." });
    if (file.size > 4 * 1024 * 1024) return setMsg({ tone: "danger", text: "Sampul maksimal 4 MB." });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cover", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) {
        setUrl(data.url);
        setMsg({ tone: "success", text: "Gambar sampul diganti." });
        router.refresh();
      } else {
        setMsg({ tone: "danger", text: data.error ?? "Upload gagal." });
      }
    } catch {
      setMsg({ tone: "danger", text: "Upload gagal — cek koneksi." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cover", { method: "DELETE" });
      if (res.ok) {
        setUrl(null);
        setMsg({ tone: "success", text: "Gambar sampul dihapus." });
        router.refresh();
      } else {
        setMsg({ tone: "danger", text: "Gagal menghapus." });
      }
    } catch {
      setMsg({ tone: "danger", text: "Gagal menghapus — cek koneksi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL sampul dinamis (driver storage apa pun)
        <img src={url} alt="Gambar sampul" className="h-32 w-full rounded-xl object-cover ring-1 ring-slate-200" />
      ) : (
        <div className="h-32 w-full rounded-xl bg-gradient-to-r from-brand-600 via-violet-500 to-fuchsia-500" />
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Memproses…" : url ? "Ganti sampul" : "Pilih sampul"}
        </button>
        {url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50"
          >
            Hapus
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">PNG/JPG/WebP maks 4 MB — otomatis dipotong 1600×400 px.</p>
    </div>
  );
}

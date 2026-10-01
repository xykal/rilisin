/**
 * Skeleton saat pindah room: navigasi tidak pernah terlihat "stuck" walau server antre.
 * Murni HTML statis (tanpa JS) — langsung tampil selagi RSC berikutnya dimuat.
 */
export default function RoomLoading() {
  return (
    <div className="chat-wide:grid chat-wide:h-full chat-wide:grid-cols-[320px_minmax(0,1fr)] chat-wide:overflow-hidden chat-wide:bg-white chat-wide-lg:grid-cols-[360px_minmax(0,1fr)] min-[1600px]:grid-cols-[400px_minmax(0,1fr)]">
      {/* Daftar room (desktop) */}
      <aside className="hidden min-h-0 flex-col bg-white chat-wide:flex chat-wide:border-r chat-wide:border-slate-200/80" aria-hidden="true">
        <div className="space-y-2 overflow-hidden p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl px-2.5 py-2.5">
              <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      {/* Isi room */}
      <div className="flex min-h-0 flex-col" aria-hidden="true">
        <div className="flex animate-pulse items-center gap-3 border-b border-slate-200/70 px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`flex animate-pulse ${i % 2 ? "justify-end" : "justify-start"}`}>
              <div className={`h-12 rounded-2xl bg-slate-200 ${i % 2 ? "w-1/3" : "w-1/2"}`} />
            </div>
          ))}
        </div>
        <div className="flex animate-pulse items-center gap-2 border-t border-slate-200/70 p-3">
          <div className="h-11 w-11 rounded-full bg-slate-200" />
          <div className="h-11 flex-1 rounded-[22px] bg-slate-100" />
          <div className="h-11 w-11 rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

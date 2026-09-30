import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/chat-app";
import { getCurrentUser } from "@/lib/auth/current-user";
import { viewerDTO } from "@/lib/chat/page-data";
import { pageOg } from "@/lib/og";
import {
  countMembers,
  getActiveMute,
  getMessageDTO,
  getReadSeq,
  getRoomBySlug,
  getRoomsForViewer,
  isRoomMember,
  joinRoom,
  listMessages,
} from "@/lib/chat/server";

export async function generateMetadata({ params }: PageProps<"/komunitas/[room]">): Promise<Metadata> {
  const { room: slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) return { title: "Komunitas" };
  // Grup privat: kartu generic (nama + ajakan) — deskripsi & isi tidak bocor ke crawler.
  if (room.isPrivate) {
    const title = `${room.name} · Grup privat`;
    const desc = "Kamu diundang ke grup privat ini. Buka link undangan untuk gabung.";
    return { title, description: desc, ...pageOg(title, desc, `/komunitas/${slug}`) };
  }
  return {
    title: `${room.name} · Komunitas`,
    description: room.description,
    ...pageOg(`${room.name} · Komunitas`, room.description, `/komunitas/${slug}`),
  };
}

export default async function RoomPage({ params, searchParams }: PageProps<"/komunitas/[room]">) {
  const { room: slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) notFound();
  const user = await getCurrentUser();
  const viewerId = user?.id ?? null;

  // Gabung via link undangan (?invite=KODE) — login dulu, lalu otomatis jadi anggota.
  const { invite } = await searchParams;
  if (typeof invite === "string" && invite && room.isPrivate && room.inviteCode && invite === room.inviteCode) {
    if (!user) redirect(`/masuk?next=${encodeURIComponent(`/komunitas/${slug}?invite=${invite}`)}`);
    await joinRoom(room.id, user.id);
    redirect(`/komunitas/${slug}`);
  }

  const member = user ? await isRoomMember(room.id, user.id) : false;
  // Privasi penuh: grup privat HANYA untuk anggota — staf pun tidak bisa intip.
  // Moderasi mengandalkan laporan anggota (moderator melihat pesan yang dilaporkan saja).
  if (room.isPrivate && !member) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">{room.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ini grup privat. Minta link undangan ke anggota grup untuk gabung — atau{" "}
          {user ? "pastikan kamu membuka link undangan yang benar." : "masuk dulu, lalu buka link undangan."}
        </p>
        {!user && (
          <Link
            href={`/masuk?next=${encodeURIComponent(`/komunitas/${slug}`)}`}
            className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
          >
            Masuk / Daftar
          </Link>
        )}
        <div className="mt-4">
          <Link href="/komunitas" className="text-sm font-semibold text-violet-700 hover:underline">
            ← Jelajahi grup publik
          </Link>
        </div>
      </div>
    );
  }

  const [rooms, memberCount, page, pinned, lastReadSeq, mute] = await Promise.all([
    getRoomsForViewer(viewerId),
    countMembers(),
    // Tamu hanya melihat cuplikan terbaru (mode baca); anggota dapat riwayat + realtime.
    listMessages({ roomId: room.id, viewerId, limit: viewerId ? 50 : 30 }),
    room.pinnedMessageId ? getMessageDTO(room.pinnedMessageId) : Promise.resolve(null),
    viewerId ? getReadSeq(viewerId, room.id) : Promise.resolve(null),
    viewerId ? getActiveMute(viewerId, room.id) : Promise.resolve(null),
  ]);

  return (
    <ChatApp
      rooms={rooms}
      activeSlug={room.slug}
      viewer={viewerDTO(user)}
      memberCount={memberCount}
      inviteCode={member ? (room.inviteCode ?? null) : null}
      initial={{ messages: page.messages, hasMore: page.hasMore, pinned: pinned?.deleted ? null : pinned, lastReadSeq, mute }}
    />
  );
}

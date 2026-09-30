import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  listMessages,
} from "@/lib/chat/server";

export async function generateMetadata({ params }: PageProps<"/komunitas/[room]">): Promise<Metadata> {
  const { room: slug } = await params;
  const room = await getRoomBySlug(slug);
  return room
    ? { title: `${room.name} · Komunitas`, description: room.description, ...pageOg(`${room.name} · Komunitas`, room.description, `/komunitas/${slug}`) }
    : { title: "Komunitas" };
}

export default async function RoomPage({ params }: PageProps<"/komunitas/[room]">) {
  const { room: slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) notFound();
  const user = await getCurrentUser();
  const viewerId = user?.id ?? null;

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
      initial={{ messages: page.messages, hasMore: page.hasMore, pinned: pinned?.deleted ? null : pinned, lastReadSeq, mute }}
    />
  );
}

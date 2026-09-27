import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";
import { getCurrentUser } from "@/lib/auth/current-user";
import { viewerDTO } from "@/lib/chat/page-data";
import { countMembers, getRoomsForViewer } from "@/lib/chat/server";

export const metadata: Metadata = {
  title: "Komunitas",
  description: "Ruang ngobrol realtime untuk developer, desainer, dan pengguna karya lokal Indonesia.",
};

export default async function CommunityPage() {
  const user = await getCurrentUser();
  const [rooms, memberCount] = await Promise.all([getRoomsForViewer(user?.id ?? null), countMembers()]);
  return <ChatApp rooms={rooms} activeSlug={null} viewer={viewerDTO(user)} initial={null} memberCount={memberCount} />;
}

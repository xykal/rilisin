import { Camera, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AvatarPanel, ProfileForm } from "@/components/profile-forms";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Edit profil", robots: { index: false } };

export default async function ProfilePage() {
  const user = await requireUser("/akun/profil");
  const [row] = await db
    .select({ displayName: users.displayName, bio: users.bio, avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Edit profil</h1>
      <p className="mt-1 text-slate-500">
        Tampil di{" "}
        <Link href={`/@${user.username}`} className="font-semibold text-brand-700 hover:underline">
          profil publikmu
        </Link>
        . Username <b className="text-ink">@{user.username}</b> tidak bisa diubah (dipakai URL & mention).
      </p>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
          <UserRound className="h-5 w-5 text-brand-600" /> Nama & bio
        </h2>
        <ProfileForm initial={{ displayName: row?.displayName ?? "", bio: row?.bio ?? "" }} />
      </Card>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
          <Camera className="h-5 w-5 text-brand-600" /> Foto profil
        </h2>
        <AvatarPanel currentUrl={mediaUrl(row?.avatarKey)} username={user.username} />
      </Card>
    </div>
  );
}

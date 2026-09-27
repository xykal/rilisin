/**
 * Data demo komunitas: ruang chat + percakapan realistis (balasan, reaksi, pesan diedit/dihapus,
 * gambar, pesan tersemat, laporan). Dipanggil dari scripts/seed.ts.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import sharp from "sharp";
import * as schema from "../src/lib/db/schema";
import { makeScreenshot } from "./seed-assets";

type Db = PostgresJsDatabase<typeof schema>;
type Msg = {
  a: string; // username penulis
  t: string; // isi
  m: number; // menit yang lalu
  re?: number; // index pesan yang dibalas (dalam ruang yang sama)
  r?: Record<string, string[]>; // reaksi: emoji → username
  edited?: boolean;
  deleted?: "author" | "moderator";
  img?: { title: string; subtitle: string; items: string[] };
};
type Room = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  kind?: "public" | "announcement";
  slowModeSec?: number;
  pin?: number;
  msgs: Msg[];
};

const H = 60;
const D = 24 * H;

const ROOMS: Room[] = [
  {
    slug: "pengumuman",
    name: "Pengumuman",
    emoji: "📢",
    description: "Info resmi dari tim Rilisin: fitur baru, event, dan jadwal maintenance.",
    kind: "announcement",
    pin: 0,
    msgs: [
      { a: "tim_rilisin", m: 4 * D, t: "Halo semua, selamat datang di *Komunitas Rilisin*! 👋\n\nIni tempat ngobrol realtime untuk developer, desainer, dan pengguna karya lokal. Sebelum mulai, baca dulu aturan singkatnya di /komunitas/aturan ya.\n\n_Tim Rilisin tidak pernah meminta password, OTP, atau kode 2FA kamu._", r: { "🙏": ["rina", "andi10", "siti11", "budi12"], "❤️": ["pixelrantau", "nusantaralabs", "dewi13"], "🔥": ["dapurkode", "rizky14"] } },
      { a: "tim_rilisin", m: 3 * D, t: "📱 *Pengingat:* mulai 30 September 2026, instal aplikasi Android dari developer yang belum terverifikasi Google butuh langkah tambahan di Indonesia. Semua APK di Rilisin sudah diberi label status verifikasinya. Panduan lengkap ada di menu Panduan → Android.", r: { "👍": ["nusantaralabs", "fajar16", "putri17", "agus18", "indah19"], "😮": ["rina"] } },
      { a: "tim_rilisin", m: 2 * D, t: "🔐 Fitur baru: *verifikasi 2 langkah (2FA)*! Aktifkan di menu akun → Keamanan akun. Sangat disarankan untuk seller — sekalian cek daftar perangkat yang sedang login di akunmu.", r: { "🔥": ["dapurkode", "rintisdesain", "bukuterbuka"], "👍": ["yoga20", "ratna21"] } },
      { a: "dimas24", m: 20 * H, t: "Info dari tim moderator: ruang #pamer-karya sekarang pakai *mode lambat 30 detik* biar postingan karya nggak tenggelam. Makasih yang sudah bantu melapor spam minggu ini 🙌", r: { "👍": ["rina", "hendra22", "maya23"] } },
    ],
  },
  {
    slug: "nongkrong",
    name: "Nongkrong",
    emoji: "☕",
    description: "Ngobrol santai sesama kreator — dari kopi sampai deadline.",
    msgs: [
      { a: "andi10", m: 26 * H, t: "Pagi gaes ☕ ada yang begadang ngejar rilis juga semalem?" },
      { a: "fajar16", m: 26 * H - 3, t: "Hadir 🙋‍♂️ baru tidur jam 3, build APK gagal mulu gara-gara gradle", r: { "😂": ["andi10", "siti11"] } },
      { a: "siti11", m: 26 * H - 5, t: "Gradle memang ujian kesabaran 😂", re: 1, r: { "💯": ["fajar16", "andi10", "rizky14"] } },
      { a: "rina", m: 25 * H, t: "Aku bukan developer, cuma pengguna warung kopi yang pakai KasirKu 😅 boleh ikut nongkrong kan?", r: { "❤️": ["nusantaralabs", "andi10", "siti11", "dewi13"] } },
      { a: "nusantaralabs", m: 25 * H - 2, t: "Boleh banget kak @rina! Justru masukan dari pengguna langsung itu yang paling berharga buat kami 🙏", re: 3, r: { "🙏": ["rina"] } },
      { a: "budi12", m: 20 * H, t: "Ada yang dari Bandung? Mau bikin kopdar kecil-kecilan akhir bulan" },
      { a: "rintisdesain", m: 20 * H - 4, t: "Bandung hadir! Studio kami di Dago, bisa jadi tempat kumpul 😄", re: 5, r: { "🔥": ["budi12", "maya23"], "👍": ["andi10"] } },
      { a: "maya23", m: 19 * H, t: "Ikutan dong kalau kopdar, aku di Cimahi", edited: true },
      { a: "hendra22", m: 18 * H, t: "Pesan ini salah kirim", deleted: "author" },
      { a: "apkgratis123", m: 9 * H, t: "Mau Canva Pro, Netflix, CapCut Pro GRATIS?? Cek bio gw, dijamin aman 100% 🔥🔥🔥" },
      { a: "rizky14", m: 9 * H - 2, t: "Waduh, ini jelas akun bajakan. Udah aku laporin ya 🚩" },
      { a: "dewi13", m: 3 * H, t: "Btw tadi baca soal verifikasi developer Android, ternyata masih bisa instal pakai ADB ya? Link resminya: https://developer.android.com/developer-verification" },
      { a: "pixelrantau", m: 3 * H - 6, t: "Iya bisa, ADB nggak berubah. Tapi buat pengguna awam ribet, jadi mending kita daftar verifikasi aja. Si Kancil udah terdaftar ✅", re: 11, r: { "👍": ["dewi13", "fajar16", "rina"] } },
      { a: "galih30", m: 40, t: "Siang-siang gini enaknya ngoding sambil makan seblak 🌶️" },
      { a: "ayu25", m: 34, t: "🤣🤣🤣", re: 13 },
      { a: "andi10", m: 21, t: "Seblak + deadline = kombinasi maut 😂", r: { "😂": ["galih30", "ayu25"] } },
      { a: "fajar16", m: 12, t: "Update: gradle akhirnya mau berdamai. Ternyata cuma perlu `./gradlew --stop` terus build ulang 🥲", re: 1, r: { "🎉": ["siti11", "andi10"] } },
      { a: "siti11", m: 6, t: "Klasik 😆 selamat bro!" },
    ],
  },
  {
    slug: "tanya-jawab",
    name: "Tanya Jawab Coding",
    emoji: "🙋",
    description: "Mentok error? Tanya di sini. Sertakan potongan kode & pesan errornya ya.",
    msgs: [
      { a: "yoga20", m: 30 * H, t: "Gaes, Laravel 11 aku kena error pas migrate:\n```\nSQLSTATE[42000]: Syntax error or access violation: 1071\nSpecified key was too long; max key length is 1000 bytes\n```\nPakai MySQL 5.7 di hosting. Ada yang pernah?" },
      { a: "dapurkode", m: 30 * H - 8, t: "Pernah! Tambahin ini di `AppServiceProvider::boot()`:\n```php\nuse Illuminate\\Support\\Facades\\Schema;\n\nSchema::defaultStringLength(191);\n```\nAtau lebih bagus lagi upgrade ke MySQL 8 kalau hostingnya support.", re: 0, r: { "🙏": ["yoga20"], "💯": ["ratna21", "eko28"] } },
      { a: "yoga20", m: 30 * H - 15, t: "Mantap, jalan! Makasih banyak bang 🙏🙏", re: 1, r: { "👍": ["dapurkode"] } },
      { a: "citra27", m: 8 * H, t: "Flutter: gimana cara simpan data offline yang paling gampang buat pemula? *SharedPreferences* atau langsung SQLite?" },
      { a: "nusantaralabs", m: 8 * H - 10, t: "Tergantung datanya:\n• pengaturan kecil → `shared_preferences`\n• data transaksi/list → SQLite (`sqflite` atau `drift`)\n\nKasirKu pakai drift karena butuh query laporan harian.", re: 3, r: { "🔥": ["citra27", "rina"] } },
      { a: "eko28", m: 2 * H, t: "Ada yang tau kenapa `fetch` di Next.js 16 aku selalu ke-cache padahal datanya berubah?" },
      { a: "dapurkode", m: 2 * H - 5, t: "Di Next 15+ `fetch` default-nya sudah *tidak* di-cache. Cek apakah halamanmu ke-render statis — coba tambahin `export const dynamic = \"force-dynamic\"` atau pakai `revalidatePath` setelah data berubah.", re: 5, r: { "👍": ["eko28"] } },
    ],
  },
  {
    slug: "pamer-karya",
    name: "Pamer Karya",
    emoji: "🚀",
    description: "Rilis app baru, update besar, atau WIP? Pamerin di sini & minta feedback.",
    slowModeSec: 30,
    msgs: [
      { a: "rintisdesain", m: 2 * D, t: "Baru rilis *UI Kit Ojek Online* — 60+ layar, komponen lengkap, gratis untuk personal. Kritik & saran sangat ditunggu 🙏", r: { "🔥": ["dapurkode", "maya23", "putri17", "rina"], "😍": ["budi12"] } },
      { a: "pixelrantau", m: 5 * H, t: "Si Kancil v1.3.0 sudah rilis! Dunia baru *Kebun Pak Tani* + simpan progres. Ini screenshot level barunya 👇", img: { title: "Kebun Pak Tani", subtitle: "Dunia 4 · Level 1–5", items: ["Level 4-1: Pagar Bambu", "Level 4-2: Ladang Jagung", "Level 4-3: Kolam Ikan"] }, r: { "😍": ["rina", "andi10", "siti11"], "🔥": ["nusantaralabs", "galih30", "ayu25", "bayu26"] } },
      { a: "rina", m: 5 * H - 20, t: "Anakku main ini tiap sore, katanya lucu kancilnya 😂 ditunggu level selanjutnya!", re: 1, r: { "❤️": ["pixelrantau"] } },
      { a: "nusantaralabs", m: 90, t: "KasirKu v2.1.0 lagi direview tim Rilisin — fitur baru: struk via Bluetooth printer & laporan mingguan. Kalau ada request fitur, bilang aja ya!", r: { "👍": ["rina", "hana31", "irfan32"] } },
      { a: "hana31", m: 70, t: "Request: export laporan ke Excel dong kak 🙏", re: 3 },
      { a: "nusantaralabs", m: 45, t: "Siap, masuk daftar untuk v2.2 ✍️", re: 4, r: { "🙏": ["hana31"] } },
    ],
  },
  {
    slug: "android-dev",
    name: "Android & Flutter",
    emoji: "🤖",
    description: "Kotlin, Flutter, rilis APK, dan aturan verifikasi developer Android 2026.",
    msgs: [
      { a: "fajar16", m: 2 * D, t: "Yang udah daftar Android developer verification, berapa lama prosesnya?" },
      { a: "pixelrantau", m: 2 * D - 30, t: "Punyaku 3 hari kerja. Siapin KTP & bukti kepemilikan app (upload APK yang ditandatangani key kamu).", re: 0, r: { "👍": ["fajar16", "joko33"] } },
      { a: "joko33", m: 22 * H, t: "Kalau cuma buat tester internal, ada opsi *limited distribution* sampai 20 perangkat tanpa KTP ya?" },
      { a: "nusantaralabs", m: 22 * H - 12, t: "Betul. Tapi buat distribusi publik tetap perlu verifikasi penuh. Di Rilisin, APK berbayar wajib dari developer terverifikasi.", re: 2, r: { "💯": ["joko33"] } },
      { a: "kartika34", m: 4 * H, t: "Rekomendasi state management Flutter 2026 apa nih? Masih Riverpod?", r: { "🤔": ["lukman35"] } },
      { a: "lukman35", m: 4 * H - 9, t: "Riverpod 3 masih enak. Kalau app kecil, `ValueNotifier` + `InheritedWidget` juga cukup kok", re: 4 },
    ],
  },
  {
    slug: "desain-ui",
    name: "Desain & UI/UX",
    emoji: "🎨",
    description: "Figma, UI kit, ilustrasi, dan kritik desain yang membangun.",
    msgs: [
      { a: "maya23", m: 28 * H, t: "Minta pendapat: warna utama ungu untuk aplikasi keuangan UMKM kurang cocok nggak sih? Biasanya kan hijau/biru" },
      { a: "rintisdesain", m: 28 * H - 20, t: "Ungu bisa kok, asal kontrasnya aman (cek WCAG minimal 4.5:1 untuk teks). Yang penting konsisten & status sukses/gagal tetap hijau/merah.", re: 0, r: { "💡": ["maya23", "putri17"] } },
      { a: "putri17", m: 6 * H, t: "Tips Figma: pakai *Auto Layout + Variables* dari awal, nanti bikin versi dark mode tinggal ganti mode. Hemat waktu banget 🙌", r: { "🔥": ["maya23", "rintisdesain", "nanda37"] } },
    ],
  },
  {
    slug: "cerita-seller",
    name: "Cerita Seller",
    emoji: "💰",
    description: "Berbagi pengalaman jualan karya digital: harga, promosi, pajak, sampai payout.",
    msgs: [
      { a: "dapurkode", m: 3 * D, t: "Cerita dikit: source code Laravel Kasir POS terjual 12 lisensi bulan ini 🥹 kuncinya ternyata dokumentasi Bahasa Indonesia yang lengkap + video instalasi.", r: { "🎉": ["bukuterbuka", "rintisdesain", "nusantaralabs", "oki38"], "👏": ["mega36"] } },
      { a: "bukuterbuka", m: 3 * D - 40, t: "Setuju! Pembeli e-book kami juga paling sering bilang \"akhirnya ada yang pakai bahasa Indonesia\" 😄", re: 0 },
      { a: "oki38", m: 30 * H, t: "Soal pajak marketplace yang PMK 37/2025 itu jadi berlaku kapan ya?" },
      { a: "tim_rilisin", m: 30 * H - 25, t: "Pemungutan PPh 22 oleh marketplace diundur ke *1 November 2026*. Seller perorangan dengan omzet ≤ Rp500 juta/tahun dibebaskan asal menyerahkan surat pernyataan. Detailnya nanti kami rangkum di panduan seller.", re: 2, r: { "🙏": ["oki38", "dapurkode", "mega36"] } },
      { a: "apkgratis123", m: 7 * H, t: "Jual akun premium murah meriah, DM aja kak, fast respon" },
      { a: "mega36", m: 3 * H, t: "Harga karya digital enaknya dibulatkan Rp49.000 atau Rp50.000 sih?", r: { "🤔": ["oki38"] } },
      { a: "dapurkode", m: 3 * H - 7, t: "Aku tes dua-duanya, Rp49.000 sedikit lebih laku. Tapi yang ngaruh banget justru screenshot & demo yang jelas 😁", re: 5, r: { "💯": ["mega36", "nanda37"] } },
    ],
  },
  {
    slug: "game-dev",
    name: "Game Dev",
    emoji: "🎮",
    description: "Godot, Unity, pixel art, dan game jam lokal.",
    msgs: [
      { a: "bayu26", m: 2 * D, t: "Godot 4 atau Unity buat game 2D pertama?" },
      { a: "pixelrantau", m: 2 * D - 15, t: "Godot! Ringan, gratis total, dan GDScript gampang dipelajari. Si Kancil full Godot 😄", re: 0, r: { "🔥": ["bayu26", "irfan32", "galih30"] } },
      { a: "irfan32", m: 10 * H, t: "Ada yang mau bikin tim buat game jam bertema *cerita rakyat* bulan depan? Aku programmer, butuh artist 🎨" },
      { a: "nanda37", m: 10 * H - 30, t: "Aku bisa pixel art! DM ya", re: 2, r: { "🤝": ["irfan32"] } },
    ],
  },
];

export async function seedChat(
  db: Db,
  ctx: {
    userIds: Map<string, string>;
    put: (key: string, data: Buffer) => Promise<void>;
    now: number;
  },
) {
  const at = (minutesAgo: number) => new Date(ctx.now - minutesAgo * 60_000);
  const id = (username: string) => {
    const v = ctx.userIds.get(username);
    if (!v) throw new Error(`User seed tidak ditemukan: ${username}`);
    return v;
  };
  let messageCount = 0;
  const roomIds = new Map<string, string>();
  const msgIds = new Map<string, string[]>();

  for (const [sort, room] of ROOMS.entries()) {
    const [r] = await db
      .insert(schema.chatRooms)
      .values({
        slug: room.slug,
        name: room.name,
        emoji: room.emoji,
        description: room.description,
        kind: room.kind ?? "public",
        sort,
        slowModeSec: room.slowModeSec ?? 0,
        createdAt: at(5 * D),
      })
      .returning({ id: schema.chatRooms.id });
    roomIds.set(room.slug, r!.id);
    const ids: string[] = [];
    for (const m of room.msgs) {
      const authorId = id(m.a);
      let image: { key: string; w: number; h: number } | null = null;
      if (m.img) {
        const shot = await makeScreenshot("game", { title: m.img.title, subtitle: m.img.subtitle, items: m.img.items }, "#2f9e6e", "#f4b740", 0);
        const out = await sharp(shot.data).resize(900, 900, { fit: "inside" }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
        const key = `public/chat/${authorId}/${randomUUID()}.webp`;
        await ctx.put(key, out.data);
        await db.insert(schema.chatUploads).values({ uploaderId: authorId, storageKey: key, width: out.info.width, height: out.info.height, sizeBytes: out.data.length, usedAt: at(m.m), createdAt: at(m.m + 1) });
        image = { key, w: out.info.width, h: out.info.height };
      }
      const created = at(m.m);
      const [row] = await db
        .insert(schema.chatMessages)
        .values({
          roomId: r!.id,
          authorId,
          body: m.deleted ? "" : m.t,
          replyToId: m.re != null ? ids[m.re]! : null,
          imageKey: image?.key ?? null,
          imageW: image?.w ?? null,
          imageH: image?.h ?? null,
          createdAt: created,
          updatedAt: created,
          editedAt: m.edited ? new Date(created.getTime() + 2 * 60_000) : null,
          deletedAt: m.deleted ? new Date(created.getTime() + 60_000) : null,
          deletedBy: m.deleted ? authorId : null,
          deleteReason: m.deleted ?? null,
        })
        .returning({ id: schema.chatMessages.id });
      ids.push(row!.id);
      messageCount++;
      if (m.edited) await db.insert(schema.chatMessageEdits).values({ messageId: row!.id, previousBody: "Ikutan dong kalau kopdar, aku di Cimahi juga dket kok", editedAt: new Date(created.getTime() + 2 * 60_000) });
      for (const [emoji, users] of Object.entries(m.r ?? {})) {
        await db.insert(schema.chatReactions).values(users.map((u, i) => ({ messageId: row!.id, userId: id(u), emoji, createdAt: new Date(created.getTime() + (i + 1) * 45_000) })));
      }
    }
    msgIds.set(room.slug, ids);
    await db
      .update(schema.chatRooms)
      .set({ lastMessageAt: at(Math.min(...room.msgs.map((m) => m.m))), pinnedMessageId: room.pin != null ? ids[room.pin]! : null })
      .where(eqId(r!.id));
  }

  // Laporan: spam di #nongkrong (2 laporan → masih tampil, masuk antrean moderator)
  const spamId = msgIds.get("nongkrong")![9]!;
  const spamBody = ROOMS.find((r) => r.slug === "nongkrong")!.msgs[9]!.t;
  const snap = (body: string, roomSlug: string, roomName: string, minutes: number) => ({
    body,
    imageKey: null,
    authorId: id("apkgratis123"),
    authorName: "APK Gratis",
    authorUsername: "apkgratis123",
    roomSlug,
    roomName,
    sentAt: at(minutes).toISOString(),
  });
  for (const [u, reason] of [["rizky14", "bajakan"], ["siti11", "spam"]] as const) {
    await db.insert(schema.reports).values({ reporterId: id(u), targetType: "chat_message", targetId: spamId, reason, snapshot: snap(spamBody, "nongkrong", "Nongkrong", 9 * H), createdAt: at(9 * H - 3) });
  }
  // Laporan: jualan akun di #cerita-seller (3 laporan → otomatis disembunyikan)
  const sellId = msgIds.get("cerita-seller")![4]!;
  const sellBody = ROOMS.find((r) => r.slug === "cerita-seller")!.msgs[4]!.t;
  for (const [u, reason] of [["oki38", "penipuan"], ["mega36", "bajakan"], ["dapurkode", "spam"]] as const) {
    await db.insert(schema.reports).values({ reporterId: id(u), targetType: "chat_message", targetId: sellId, reason, note: u === "oki38" ? "Akun baru, jualan akun premium ilegal" : null, snapshot: snap(sellBody, "cerita-seller", "Cerita Seller", 7 * H), createdAt: at(7 * H - 10) });
  }
  await db.update(schema.chatMessages).set({ reportHiddenAt: at(7 * H - 30), updatedAt: at(7 * H - 30) }).where(eqMsg(sellId));

  // Penanda baca akun demo (Rina): ada pesan belum dibaca di #nongkrong & #pamer-karya
  const rinaId = id("rina");
  const seqOf = async (msgId: string) =>
    (await db.select({ seq: schema.chatMessages.seq }).from(schema.chatMessages).where(eqMsg(msgId)))[0]!.seq;
  const reads: [string, string][] = [
    ["nongkrong", msgIds.get("nongkrong")![12]!],
    ["pamer-karya", msgIds.get("pamer-karya")![2]!],
    ["tanya-jawab", msgIds.get("tanya-jawab")!.at(-1)!],
    ["pengumuman", msgIds.get("pengumuman")!.at(-1)!],
  ];
  for (const [slug, msgId] of reads) {
    await db.insert(schema.chatReads).values({ userId: rinaId, roomId: roomIds.get(slug)!, lastReadSeq: await seqOf(msgId) });
  }

  return { rooms: ROOMS.length, messages: messageCount };
}

const eqId = (roomId: string) => eq(schema.chatRooms.id, roomId);
const eqMsg = (msgId: string) => eq(schema.chatMessages.id, msgId);

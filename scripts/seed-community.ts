/**
 * Data demo Fase 3: kategori & thread forum (balasan, upvote, jawaban terbaik, mention), ulasan produk
 * (hanya dari pemilik yang sah — dicek dari tabel entitlements), balasan seller, laporan contoh, dan notifikasi.
 * Penghitung (skor, jumlah balasan, rating produk) diisi trigger database, bukan di sini.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;
const DAY = 86_400_000;
const HOUR = 3_600_000;

type ReplySeed = { by: string; body: string; h: number; votes?: string[]; accepted?: boolean; reports?: { by: string; reason: string; note?: string }[] };
type ThreadSeed = {
  key: string;
  cat: string;
  by: string;
  title: string;
  body: string;
  days: number;
  product?: string;
  pinned?: boolean;
  locked?: boolean;
  votes?: string[];
  replies?: ReplySeed[];
};

const CATEGORIES = [
  { slug: "pengumuman", name: "Pengumuman", emoji: "📢", kind: "announcement" as const, description: "Kabar resmi dari Tim Rilisin: fitur baru, aturan, dan jadwal pemeliharaan." },
  { slug: "tanya-jawab", name: "Tanya Jawab", emoji: "🙋", kind: "qa" as const, description: "Buntu soal coding, rilis aplikasi, atau jualan? Tanya di sini — tandai jawaban terbaik." },
  { slug: "pamer-karya", name: "Pamer Karya", emoji: "🚀", kind: "discussion" as const, description: "Showcase aplikasi, game, dan template buatanmu. Minta masukan jujur." },
  { slug: "devlog", name: "Devlog & Update", emoji: "🛠️", kind: "discussion" as const, description: "Catatan proses pengembangan dan rilis versi baru." },
  { slug: "request", name: "Request Aplikasi", emoji: "💡", kind: "discussion" as const, description: "Butuh aplikasi atau template tertentu? Siapa tahu ada yang mau bikin." },
  { slug: "cari-tim", name: "Cari Tim & Kolaborasi", emoji: "🤝", kind: "discussion" as const, description: "Cari partner coding, desainer, penguji, atau penerjemah." },
  { slug: "masukan", name: "Masukan untuk Rilisin", emoji: "📮", kind: "discussion" as const, description: "Saran fitur dan laporan bug untuk platform ini." },
  { slug: "warung-kopi", name: "Warung Kopi", emoji: "☕", kind: "discussion" as const, description: "Ngobrol santai seputar dunia developer & kreator." },
];

const T = "```";

const THREADS: ThreadSeed[] = [
  {
    key: "welcome",
    cat: "pengumuman",
    by: "tim_rilisin",
    days: 20,
    pinned: true,
    title: "Selamat datang di Forum Rilisin — baca ini dulu ya",
    body: `Halo semua! Forum ini pelengkap **chat komunitas**: tempat diskusi yang perlu **diarsip dan gampang dicari lagi**.

**Cara pakai singkat**
- Pilih kategori yang pas. Pertanyaan teknis → *Tanya Jawab*.
- Di Tanya Jawab, penanya bisa menandai **jawaban terbaik** supaya orang berikutnya cepat ketemu solusinya.
- Upvote thread/balasan yang membantu.
- Sebut orang dengan \`@username\` — dia dapat notifikasi.
- Punya pertanyaan soal produk tertentu? Buka halaman produknya → **Mulai diskusi**.

**Aturan**
1. Sopan, tanpa SARA dan pelecehan.
2. Dilarang promosi judi online, pinjol ilegal, dan link bajakan — otomatis diblokir.
3. Akun baru (< 24 jam) belum bisa menaruh link (anti-spam).

Lihat konten yang melanggar? Klik **Laporkan**. Selamat berdiskusi!`,
    votes: ["andi10", "siti11", "budi12", "dewi13", "rizky14", "maya23", "hana31"],
    replies: [
      { by: "andi10", h: 2, body: "Mantap, akhirnya ada forum. Chat kadang tenggelam kalau nyari jawaban lama 😄", votes: ["siti11", "budi12"] },
      { by: "pixelrantau", h: 5, body: "Siap! Devlog game kami nanti ditaruh di kategori Devlog ya." },
    ],
  },
  {
    key: "android",
    cat: "pengumuman",
    by: "tim_rilisin",
    days: 6,
    locked: true,
    title: "Mulai 30 September 2026: aturan baru instal APK di Indonesia",
    body: `Google mulai mewajibkan verifikasi developer untuk aplikasi Android yang diinstal di perangkat bersertifikasi di **Indonesia, Brasil, Singapura, dan Thailand**.

Yang perlu kamu tahu sebagai **pengguna**:
- Aplikasi dari developer terverifikasi: instal seperti biasa.
- Aplikasi dari developer belum terverifikasi: masih bisa lewat *mode lanjutan* (sekali atur, ada jeda 24 jam).

Yang perlu kamu tahu sebagai **developer**:
- Isi nama paket dan status verifikasi di formulir produk. Moderator mengecek bukti sebelum badge terverifikasi muncul.

Panduan lengkap: [Panduan Android](/panduan/android). Thread ini dikunci — pertanyaan silakan di Tanya Jawab.`,
    votes: ["fajar16", "nur15", "putri17", "lukman35"],
    replies: [
      { by: "fajar16", h: 3, body: "Makasih infonya. Berarti APK debug yang dibagikan ke teman buat testing juga kena ya?" },
      { by: "tim_rilisin", h: 4, body: "Betul, termasuk APK yang dibagikan manual. Untuk testing terbatas ada akun distribusi terbatas (maks. 20 perangkat) — detailnya di panduan." },
    ],
  },
  {
    key: "printer",
    cat: "tanya-jawab",
    by: "rina",
    days: 9,
    product: "kasirku",
    title: "KasirKu Offline bisa cetak struk ke printer thermal Bluetooth 58 mm?",
    body: "Halo, saya pakai KasirKu Offline di warung kopi. Mau beli printer thermal Bluetooth 58 mm yang murah (sekitar 200 ribuan). Apakah sudah didukung? Kalau iya, merek apa yang aman? HP saya Android 13.",
    votes: ["eko28", "siti11", "galih30"],
    replies: [
      { by: "eko28", h: 2, body: "Saya pakai printer 58 mm merek lokal yang paling banyak dijual di marketplace, lancar di KasirKu. Pairing dulu lewat Bluetooth HP, baru pilih di pengaturan printer aplikasinya.", votes: ["rina", "yoga20"] },
      {
        by: "nusantaralabs",
        h: 5,
        accepted: true,
        votes: ["rina", "eko28", "andi10", "siti11", "dewi13"],
        body: `Halo Mbak Rina, terima kasih sudah pakai KasirKu 🙏

Sudah didukung sejak **v2.1**. Printer thermal 58 mm dengan protokol **ESC/POS** hampir semua jalan. Langkahnya:

1. Pairing printer di **Pengaturan → Bluetooth** HP.
2. Buka KasirKu → **Pengaturan → Printer** → pilih printernya.
3. Tekan **Cetak uji**.

Kalau hasil cetak hurufnya aneh, ganti *Code page* ke **PC437**. Printer 80 mm juga bisa, tinggal pilih lebar kertas.`,
      },
      { by: "rina", h: 7, body: "Berhasil! Cetak uji langsung keluar. Makasih banyak @nusantaralabs 🙌", votes: ["nusantaralabs"] },
    ],
  },
  {
    key: "flutter",
    cat: "tanya-jawab",
    by: "budi12",
    days: 4,
    title: "APK Flutter release ukurannya 60 MB, gimana cara mengecilkannya?",
    body: "Aplikasi Flutter saya cuma 5 halaman tapi APK release-nya 60 MB. Sudah pakai `flutter build apk --release`. Apa yang salah?\n\nDependensi: `firebase_core`, `google_fonts`, `sqflite`, `image_picker`.",
    votes: ["andi10", "irfan32", "galih30", "joko33"],
    replies: [
      {
        by: "bukuterbuka",
        h: 1,
        accepted: true,
        votes: ["budi12", "andi10", "fajar16", "galih30", "irfan32", "nanda37"],
        body: `Wajar — APK "gemuk" berisi library untuk 3 arsitektur sekaligus. Coba:

${T}bash
flutter build apk --release --split-per-abi
${T}

Hasilnya 3 APK (armeabi-v7a, arm64-v8a, x86_64), masing-masing ~15–20 MB. Untuk HP modern cukup bagikan yang **arm64-v8a**.

Tambahan:
- Aktifkan \`minifyEnabled\` & \`shrinkResources\` di \`android/app/build.gradle\`.
- \`google_fonts\` bisa diganti font lokal yang dibundel (hanya weight yang dipakai).
- Kalau rilis di Play Store, pakai **App Bundle** (\`flutter build appbundle\`) — Play yang memecah per perangkat.`,
      },
      { by: "irfan32", h: 3, body: "Tambahan: cek juga aset gambar. Saya pernah nemu PNG 4 MB buat splash screen 😅 Kompres ke WebP.", votes: ["budi12", "maya23"] },
      { by: "budi12", h: 6, body: "Split per ABI → arm64 jadi 18 MB. Mantap, makasih!" },
    ],
  },
  {
    key: "webhook",
    cat: "tanya-jawab",
    by: "galih30",
    days: 1,
    title: "Webhook payment gateway nggak masuk waktu testing di localhost",
    body: "Lagi integrasi payment gateway (QRIS) di project Next.js. Transaksi sukses di dashboard sandbox, tapi webhook ke `http://localhost:3000/api/webhook` nggak pernah masuk. Harus deploy dulu atau ada cara lain?",
    votes: ["nanda37"],
  },
  {
    key: "nextcache",
    cat: "tanya-jawab",
    by: "nanda37",
    days: 12,
    title: "Next.js 16: data dari fetch di server component kok nggak ke-cache?",
    body: "Saya upgrade dari Next 14 ke 16. Dulu `fetch()` di server component otomatis ke-cache, sekarang setiap request nembak API lagi. Ini bug atau memang berubah?",
    votes: ["lukman35", "oki38"],
    replies: [
      {
        by: "dapurkode",
        h: 2,
        accepted: true,
        votes: ["nanda37", "lukman35", "oki38", "irfan32"],
        body: `Memang berubah sejak Next 15: \`fetch\` **tidak lagi di-cache secara default**. Pilihannya:

${T}ts
// simpan di cache sampai direvalidasi
await fetch(url, { cache: "force-cache" });
// atau revalidasi berkala (detik)
await fetch(url, { next: { revalidate: 300 } });
${T}

Di Next 16 ada juga directive \`"use cache"\` untuk fungsi/komponen. Penjelasannya ada di Starter Kit kami bagian *Caching* 😉`,
      },
      { by: "lukman35", h: 4, body: "Kena juga saya kemarin. Dokumentasinya ada di upgrade guide bagian *Caching*." },
    ],
  },
  {
    key: "kancil14",
    cat: "pamer-karya",
    by: "pixelrantau",
    days: 7,
    product: "kancil",
    title: "Petualangan Si Kancil v1.4 — level baru hutan bakau & mode offline penuh",
    body: `Halo! Kami baru rilis **v1.4** Petualangan Si Kancil 🦌

Yang baru:
- 5 level baru bertema **hutan bakau Kalimantan**
- Bisa dimainkan **tanpa internet** sepenuhnya
- Ukuran turun dari 48 MB ke **31 MB**

Kami lagi cari masukan soal tingkat kesulitan level 12 — katanya terlalu susah untuk anak SD. Coba dan kabari ya!`,
    votes: ["ayu25", "citra27", "hana31", "mega36", "andi10", "fitri29"],
    replies: [
      { by: "ayu25", h: 3, body: "Anak saya (kelas 3) suka banget musiknya! Level 12 memang susah di bagian lompat buaya, dia sampai minta tolong 😂", votes: ["pixelrantau", "citra27"] },
      { by: "pixelrantau", h: 6, body: "Makasih masukannya @ayu25! Di v1.4.1 jarak lompatnya kami longgarkan sedikit." },
      { by: "citra27", h: 26, body: "Pixel art-nya rapi banget. Boleh share tools yang dipakai?", votes: ["ayu25"] },
      { by: "pixelrantau", h: 28, body: "Aseprite untuk sprite, Tiled untuk peta, engine-nya Godot 4 👌" },
    ],
  },
  {
    key: "uikit2",
    cat: "pamer-karya",
    by: "rintisdesain",
    days: 15,
    product: "uikitojol",
    title: "Sneak peek UI Kit Ojek Online v2: dark mode & 40 layar baru",
    body: "Lagi mengerjakan versi 2 UI Kit Ojek Online. Yang sudah jadi: dark mode, alur pesan makanan, dan halaman dompet digital. Pembeli v1 dapat update gratis. Ada layar yang pengin kalian lihat di v2?",
    votes: ["indah19", "yoga20", "rina"],
    replies: [
      { by: "indah19", h: 5, body: "Pembeli v1 di sini 👋 Tolong tambahkan layar **pelacakan driver real-time** dong, yang ada peta + estimasi waktu." },
      { by: "yoga20", h: 8, body: "Setuju. Plus layar chat driver–penumpang." },
      { by: "rintisdesain", h: 24, body: "Noted! Dua-duanya masuk daftar. Target rilis akhir bulan depan." },
    ],
  },
  {
    key: "becak3",
    cat: "devlog",
    by: "pixelrantau",
    days: 3,
    product: "becak",
    title: "Devlog #3 Balap Becak Nusantara: fisika becak dan mode 2 pemain",
    body: `Minggu ini fokus ke **fisika becak**. Becak itu unik: roda depan dua, pengemudi di belakang — jadi titik beratnya aneh 😅

Catatan teknis singkat (Godot 4):

${T}gdscript
func _physics_process(delta):
    var steer = Input.get_axis("kiri", "kanan")
    rotation += steer * turn_speed * delta * (velocity.length() / max_speed)
${T}

Kecepatan belok sekarang tergantung kecepatan — becak yang pelan nggak bisa belok tajam. Mode **2 pemain di satu layar** juga sudah bisa dicoba di build beta.`,
    votes: ["bayu26", "eko28", "joko33"],
    replies: [
      { by: "bayu26", h: 4, body: "Keren! Mode 2 pemain ini yang ditunggu anak kos 😆 Ada rencana online multiplayer?" },
      { by: "pixelrantau", h: 7, body: "Belum dulu — fokus offline supaya enak dimainkan di mana saja. Mungkin setelah v1.0." },
    ],
  },
  {
    key: "santri",
    cat: "request",
    by: "hendra22",
    days: 10,
    title: "Ada yang bisa bikin aplikasi absensi santri offline? (pondok ±300 santri)",
    body: "Kami pengurus pondok pesantren di Jawa Timur. Butuh aplikasi absensi santri yang bisa jalan **offline** (sinyal susah), rekap bulanan ke Excel, dan dipakai di 3 HP ustaz. Budget terbatas tapi siap bayar wajar. Ada yang minat?",
    votes: ["fitri29", "nusantaralabs"],
    replies: [
      { by: "nusantaralabs", h: 6, body: "Halo, kami punya **Absensi Sekolah Lite** yang offline-first — mungkin bisa disesuaikan untuk pondok (istilah kelas → kamar/halaqah). Boleh saya hubungi lewat pesan?" },
      { by: "hendra22", h: 9, body: "Boleh sekali, Mas. Saya coba dulu versi Lite-nya." },
      { by: "fitri29", h: 30, body: "Kalau butuh penguji, saya pengajar TPQ, siap bantu coba." },
    ],
  },
  {
    key: "ilustrator",
    cat: "cari-tim",
    by: "maya23",
    days: 5,
    title: "Cari ilustrator untuk game edukasi anak (bagi hasil)",
    body: "Saya programmer game (Godot), sedang bikin game edukasi mengenal aksara Jawa untuk anak TK–SD. Butuh ilustrator karakter dengan gaya lucu. Sistem bagi hasil 50:50 dari penjualan di Rilisin, kontrak tertulis. Minat? Balas di sini dengan contoh karya.",
    votes: ["citra27"],
    replies: [{ by: "citra27", h: 26, body: "Halo! Saya ilustrator lepas, biasa gambar buku anak. Tertarik, saya kirim pesan ya." }],
  },
  {
    key: "filterharga",
    cat: "masukan",
    by: "oki38",
    days: 8,
    title: "Usul: filter harga di Jelajahi bisa pakai rentang (misal di bawah Rp50.000)",
    body: "Sekarang filter cuma gratis/berbayar. Kalau ada rentang harga, lebih enak buat yang budget-nya terbatas. Setuju?",
    votes: ["kartika34", "lukman35", "mega36", "andi10"],
    replies: [
      { by: "kartika34", h: 2, body: "Setuju, plus urutkan dari harga termurah.", votes: ["oki38"] },
      { by: "tim_rilisin", h: 24, body: "Terima kasih usulnya! Masuk daftar fase berikutnya. Sementara itu, urutan **Rating tertinggi** baru saja ditambahkan di Jelajahi." },
    ],
  },
  {
    key: "setup",
    cat: "warung-kopi",
    by: "joko33",
    days: 2,
    title: "Setup kerja kalian gimana? Share meja kerja dong ☕",
    body: "Saya masih pakai laptop RAM 8 GB + kipas angin 😅 Build Flutter kadang bikin laptop kayak mau terbang. Kalian gimana?",
    votes: ["andi10", "lukman35", "hana31", "bayu26", "eko28"],
    replies: [
      { by: "andi10", h: 1, body: "Sama, 8 GB. Tips: tutup Chrome waktu build Android 😂", votes: ["joko33", "bayu26", "eko28"] },
      { by: "lukman35", h: 2, body: "Mini PC bekas + monitor 24 inci. Build jadi jauh lebih cepat, laptop cuma buat meeting." },
      { by: "hana31", h: 4, body: "Aku kerja di kafe, modal colokan sama WiFi gratis 🤣", votes: ["joko33", "andi10"] },
      { by: "bayu26", h: 5, body: "Build di CI aja, laptop tinggal nulis kode. GitHub Actions gratis buat repo publik.", votes: ["joko33", "lukman35", "irfan32"] },
      {
        by: "agus18",
        h: 6,
        body: "Mau laptop kencang harga miring? Cek toko saya kak, cicilan 0% tanpa kartu kredit, langsung chat admin di profil ya 🙏🙏",
        reports: [
          { by: "joko33", reason: "spam", note: "Promosi toko, nggak nyambung sama topik" },
          { by: "hana31", reason: "spam" },
        ],
      },
    ],
  },
  {
    key: "ekspor",
    cat: "request",
    by: "andi10",
    days: 11,
    product: "kasirku",
    title: "Request fitur KasirKu: ekspor laporan harian ke Excel",
    body: "Sudah pakai KasirKu 2 bulan, mantap. Satu yang kurang: ekspor laporan harian ke Excel/CSV buat setor ke pemilik toko. Sekarang saya masih foto layar 😅",
    votes: ["siti11", "dewi13"],
    replies: [
      { by: "nusantaralabs", h: 20, body: "Siap, sedang dikerjakan untuk **v2.3** (ekspor CSV dulu, Excel menyusul). Terima kasih masukannya!", votes: ["andi10", "siti11"] },
      { by: "siti11", h: 23, body: "Ditunggu! Saya juga butuh." },
    ],
  },
];

type ReviewSeed = { by?: string; rating: number; body: string; reply?: string; report?: { by: string; reason: string; note?: string } };
/** Ulasan per produk. `by` kosong = diambil dari pemilik (entitlement) berikutnya secara urut username. */
const REVIEWS: Record<string, ReviewSeed[]> = {
  kasirku: [
    { by: "rina", rating: 5, body: "Dipakai tiap hari di warung kopi saya. Cepat, tanpa internet, dan cetak struk ke printer Bluetooth lancar. Terima kasih Nusantara Labs!", reply: "Terima kasih Mbak Rina! Senang bisa bantu warungnya. Fitur ekspor laporan segera hadir 🙏" },
    { rating: 5, body: "Ringan banget di HP kentang saya. Stok barang juga gampang diatur." },
    { rating: 4, body: "Bagus, tapi mohon ditambah ekspor laporan ke Excel." },
    { rating: 5, body: "Aplikasi kasir gratis terbaik yang pernah saya coba." },
    { rating: 3, body: "Fitur lengkap, tapi tampilan di tablet hurufnya agak kecil.", reply: "Terima kasih masukannya! Mode tablet dengan huruf lebih besar masuk rencana v2.3." },
    { rating: 4, body: "Sudah 3 bulan dipakai, belum pernah crash." },
    { rating: 5, body: "" },
  ],
  kancil: [
    { rating: 5, body: "Anak saya suka banget, main sambil belajar cerita rakyat." },
    { rating: 4, body: "Grafisnya lucu, tapi level 12 lumayan susah buat anak kecil." },
    { rating: 5, body: "Game lokal berkualitas, semoga terus update!" },
    { rating: 2, body: "Di HP saya (Android 9) sering keluar sendiri di level 8. Mohon diperbaiki.", reply: "Maaf ya kak, bug di Android 9 sudah kami perbaiki di v1.4 — coba update ya 🙏" },
    { rating: 5, body: "Full offline, cocok dimainkan di perjalanan mudik." },
    { rating: 1, body: "Jelek, buang-buang waktu. Mending main game lain.", report: { by: "pixelrantau", reason: "palsu", note: "Akun ini memberi bintang 1 ke semua game lokal hari yang sama." } },
  ],
  landingumkm: [
    { rating: 5, body: "Template-nya rapi, dokumentasi Bahasa Indonesia jelas. Sehari jadi website toko." },
    { rating: 4, body: "Mantap, tapi warna bawaannya kurang cocok buat toko saya — untung gampang diganti." },
  ],
  ebookandroid: [
    { rating: 5, body: "Penjelasan soal verifikasi developer Android 2026 paling jelas yang saya temukan." },
    { rating: 4, body: "Bagus untuk pemula. Bab Play Console bisa lebih detail." },
  ],
  starterkit: [
    { rating: 5, body: "Struktur foldernya enak, login & daftar sudah jadi." },
    { rating: 5, body: "Bagian caching Next 16-nya menolong banget waktu upgrade." },
  ],
  kasirkupro: [
    { by: "andi10", rating: 5, body: "Fitur multi-kasir dan laporan laba rugi worth it banget untuk Rp49 ribu.", reply: "Terima kasih Mas Andi! Sinkronisasi antar HP versi baru sedang diuji." },
    { by: "dewi13", rating: 4, body: "Bagus, semoga sinkronisasi antar HP bisa lebih cepat." },
  ],
  uikitojol: [
    { by: "indah19", rating: 5, body: "Komponennya rapi, auto layout semua. Hemat waktu desain berminggu-minggu." },
    { by: "yoga20", rating: 4, body: "Lengkap, tapi file Figma-nya agak berat di laptop saya." },
  ],
  laravelpos: [
    { by: "nur15", rating: 5, body: "Kodenya bersih, dokumentasi lengkap, langsung jalan di hosting murah." },
    { by: "fajar16", rating: 3, body: "Bagus, tapi butuh PHP 8.3 — sempat bingung di hosting lama.", reply: "Terima kasih! Panduan pindah ke PHP 8.3 di hosting populer sudah kami tambahkan di dokumentasi." },
  ],
  tebakkata: [{ by: "ratna21", rating: 5, body: "Seru buat main bareng keluarga, sekalian belajar bahasa daerah." }],
};

export async function seedCommunity(db: Db, ctx: { userIds: Map<string, string>; productIds: Map<string, string>; now: number }) {
  const { userIds, productIds, now } = ctx;
  const at = (ms: number) => new Date(Math.min(ms, now - 10 * 60_000));
  const uid = (username: string) => {
    const id = userIds.get(username);
    if (!id) throw new Error(`seed-community: user ${username} tidak ada`);
    return id;
  };

  // ── Kategori
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const [row] = await db
      .insert(schema.forumCategories)
      .values({ ...c, sort: i, createdAt: new Date(now - 30 * DAY) })
      .returning({ id: schema.forumCategories.id });
    catIds.set(c.slug, row!.id);
  }

  // ── Thread, balasan, vote
  const threadIds = new Map<string, string>();
  const threadTitles = new Map<string, string>();
  const replyIdsByThread = new Map<string, { id: string; by: string; accepted?: boolean }[]>();
  let replies = 0;
  for (const t of THREADS) {
    const created = at(now - t.days * DAY - 3 * HOUR);
    const [row] = await db
      .insert(schema.forumThreads)
      .values({
        categoryId: catIds.get(t.cat)!,
        authorId: uid(t.by),
        productId: t.product ? productIds.get(t.product) ?? null : null,
        title: t.title,
        body: t.body,
        createdAt: created,
        updatedAt: created,
        lastActivityAt: created,
        pinnedAt: t.pinned ? created : null,
      })
      .returning({ id: schema.forumThreads.id });
    const threadId = row!.id;
    threadIds.set(t.key, threadId);
    threadTitles.set(t.key, t.title);
    for (const v of t.votes ?? []) {
      if (v === t.by) continue;
      await db.insert(schema.forumVotes).values({ userId: uid(v), targetType: "thread", targetId: threadId, createdAt: at(created.getTime() + HOUR) }).onConflictDoNothing();
    }
    const list: { id: string; by: string; accepted?: boolean }[] = [];
    for (const r of t.replies ?? []) {
      const rc = at(created.getTime() + r.h * HOUR);
      const [rr] = await db
        .insert(schema.forumReplies)
        .values({ threadId, authorId: uid(r.by), body: r.body, createdAt: rc, updatedAt: rc })
        .returning({ id: schema.forumReplies.id });
      replies++;
      list.push({ id: rr!.id, by: r.by, accepted: r.accepted });
      for (const v of r.votes ?? []) {
        if (v === r.by) continue;
        await db.insert(schema.forumVotes).values({ userId: uid(v), targetType: "reply", targetId: rr!.id, createdAt: at(rc.getTime() + HOUR) }).onConflictDoNothing();
      }
      if (r.accepted) await db.update(schema.forumThreads).set({ acceptedReplyId: rr!.id }).where(eq(schema.forumThreads.id, threadId));
      for (const rep of r.reports ?? []) {
        const [author] = await db.select({ name: schema.users.displayName, username: schema.users.username }).from(schema.users).where(eq(schema.users.id, uid(r.by)));
        await db.insert(schema.reports).values({
          reporterId: uid(rep.by),
          targetType: "forum_reply",
          targetId: rr!.id,
          reason: rep.reason,
          note: rep.note ?? null,
          snapshot: {
            body: r.body,
            authorId: uid(r.by),
            authorName: author?.name,
            authorUsername: author?.username,
            context: t.title,
            url: `/forum/t/${threadId}?balasan=${rr!.id}#b-${rr!.id}`,
            postedAt: rc.toISOString(),
          },
          createdAt: at(rc.getTime() + 2 * HOUR),
        });
      }
    }
    replyIdsByThread.set(t.key, list);
    if (t.locked) await db.update(schema.forumThreads).set({ lockedAt: at(created.getTime() + 5 * HOUR) }).where(eq(schema.forumThreads.id, threadId));
  }

  // ── Ulasan (hanya dari pemilik yang sah)
  let reviews = 0;
  const reviewRefs: { key: string; reviewId: string; userId: string; rating: number; body: string; replied: boolean; at: Date }[] = [];
  for (const [key, seeds] of Object.entries(REVIEWS)) {
    const productId = productIds.get(key);
    if (!productId) continue;
    const [prod] = await db.select({ sellerId: schema.products.sellerId, slug: schema.products.slug, title: schema.products.title }).from(schema.products).where(eq(schema.products.id, productId));
    const [latest] = await db
      .select({ version: schema.releases.version })
      .from(schema.releases)
      .where(and(eq(schema.releases.productId, productId), eq(schema.releases.status, "published")))
      .orderBy(desc(schema.releases.publishedAt))
      .limit(1);
    const owners = await db
      .select({ userId: schema.entitlements.userId, username: schema.users.username, since: schema.entitlements.createdAt })
      .from(schema.entitlements)
      .innerJoin(schema.users, eq(schema.users.id, schema.entitlements.userId))
      .where(eq(schema.entitlements.productId, productId))
      .orderBy(schema.users.username);
    const explicit = new Set(seeds.filter((s) => s.by).map((s) => s.by!));
    // "rina" (akun demo) sengaja TIDAK mengulas Petualangan Si Kancil — dipakai smoke test untuk menulis ulasan baru
    const pool = owners.filter((o) => !explicit.has(o.username) && o.username !== "rina" && o.userId !== prod!.sellerId);
    let next = 0;
    for (const s of seeds) {
      const owner = s.by ? owners.find((o) => o.username === s.by) : pool[next++];
      if (!owner) continue;
      const created = at(owner.since.getTime() + (1 + (reviews % 3)) * DAY + (reviews % 7) * HOUR);
      const [rv] = await db
        .insert(schema.productReviews)
        .values({
          productId,
          userId: owner.userId,
          rating: s.rating,
          body: s.body,
          version: latest?.version ?? null,
          sellerReply: s.reply ?? null,
          sellerRepliedAt: s.reply ? at(created.getTime() + 5 * HOUR) : null,
          createdAt: created,
          updatedAt: created,
        })
        .onConflictDoNothing()
        .returning({ id: schema.productReviews.id });
      if (!rv) continue;
      reviews++;
      reviewRefs.push({ key, reviewId: rv.id, userId: owner.userId, rating: s.rating, body: s.body, replied: Boolean(s.reply), at: created });
      if (s.report) {
        const [author] = await db.select({ name: schema.users.displayName, username: schema.users.username }).from(schema.users).where(eq(schema.users.id, owner.userId));
        await db.insert(schema.reports).values({
          reporterId: uid(s.report.by),
          targetType: "review",
          targetId: rv.id,
          reason: s.report.reason,
          note: s.report.note ?? null,
          snapshot: {
            body: s.body,
            rating: s.rating,
            authorId: owner.userId,
            authorName: author?.name,
            authorUsername: author?.username,
            context: prod!.title,
            url: `/p/${prod!.slug}/ulasan#ulasan-${rv.id}`,
            postedAt: created.toISOString(),
          },
          createdAt: at(created.getTime() + 3 * HOUR),
        });
      }
    }
  }

  // ── Notifikasi contoh untuk akun demo (tanpa email)
  const productUrl = (key: string) => `/p/${key}`;
  const slugOf = async (key: string) => {
    const [p] = await db.select({ slug: schema.products.slug, title: schema.products.title }).from(schema.products).where(eq(schema.products.id, productIds.get(key)!));
    return p!;
  };
  const kasirku = await slugOf("kasirku");
  const kancil = await slugOf("kancil");
  const printer = threadIds.get("printer")!;
  const printerReplies = replyIdsByThread.get("printer")!;
  const flutterReplies = replyIdsByThread.get("flutter")!;
  const nextReplies = replyIdsByThread.get("nextcache")!;
  const rinaReview = reviewRefs.find((r) => r.key === "kasirku" && r.userId === uid("rina"));
  const kasirkuNew = reviewRefs.filter((r) => r.key === "kasirku" && r.userId !== uid("rina")).slice(-3);
  const kancilNew = reviewRefs.filter((r) => r.key === "kancil").slice(-2);
  const [proOrder] = await db
    .select({ code: schema.orders.code, earning: schema.orders.sellerEarningIdr, paidAt: schema.orders.paidAt, buyerId: schema.orders.buyerId })
    .from(schema.orders)
    .where(and(eq(schema.orders.productId, productIds.get("kasirkupro")!), eq(schema.orders.status, "paid")))
    .orderBy(desc(schema.orders.paidAt))
    .limit(1);
  const [rinaOrder] = await db
    .select({ code: schema.orders.code, title: schema.orders.productTitle, paidAt: schema.orders.paidAt })
    .from(schema.orders)
    .where(and(eq(schema.orders.buyerId, uid("rina")), eq(schema.orders.status, "paid")))
    .limit(1);
  const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * HOUR);
  type N = typeof schema.notifications.$inferInsert;
  const notes: N[] = [];
  const push = (n: N & { at: Date; read?: boolean }) => {
    const { at: when, read, ...rest } = n;
    notes.push({ ...rest, createdAt: when, updatedAt: when, readAt: read ? when : null });
  };
  if (rinaReview) {
    push({ userId: uid("rina"), type: "review_reply", actorId: uid("nusantaralabs"), url: `/p/${kasirku.slug}/ulasan#ulasan-${rinaReview.reviewId}`, data: { productTitle: kasirku.title, snippet: "Terima kasih Mbak Rina! Senang bisa bantu warungnya. Fitur ekspor laporan segera hadir 🙏" }, groupKey: `review_reply:${rinaReview.reviewId}`, at: ago(0, 20) });
  }
  push({ userId: uid("rina"), type: "forum_reply", actorId: uid("nusantaralabs"), url: `/forum/t/${printer}?balasan=${printerReplies[1]!.id}#b-${printerReplies[1]!.id}`, data: { threadTitle: threadTitles.get("printer")!, snippet: "Halo Mbak Rina, terima kasih sudah pakai KasirKu 🙏 Sudah didukung sejak v2.1…" }, count: 2, at: ago(8, 22), read: true });
  if (rinaOrder) push({ userId: uid("rina"), type: "order_paid", url: `/pesanan/${rinaOrder.code}`, data: { orderCode: rinaOrder.code, productTitle: rinaOrder.title }, at: rinaOrder.paidAt ?? ago(20), read: true });

  if (proOrder) push({ userId: uid("nusantaralabs"), type: "sale", actorId: proOrder.buyerId, url: "/seller/penjualan", data: { productTitle: "KasirKu Pro", earning: proOrder.earning, holdDays: 7 }, groupKey: `sale:${uid("nusantaralabs")}`, count: 2, at: proOrder.paidAt ?? ago(1) });
  if (kasirkuNew.length) {
    const last = kasirkuNew[kasirkuNew.length - 1]!;
    push({ userId: uid("nusantaralabs"), type: "review_new", actorId: last.userId, url: `/p/${kasirku.slug}/ulasan#ulasan-${last.reviewId}`, data: { productTitle: kasirku.title, rating: last.rating, snippet: last.body || null }, groupKey: `review_new:${productIds.get("kasirku")}`, count: kasirkuNew.length, at: last.at });
  }
  push({ userId: uid("nusantaralabs"), type: "forum_mention", actorId: uid("rina"), url: `/forum/t/${printer}?balasan=${printerReplies[2]!.id}#b-${printerReplies[2]!.id}`, data: { threadTitle: threadTitles.get("printer")!, snippet: "Berhasil! Cetak uji langsung keluar. Makasih banyak @nusantaralabs 🙌" }, groupKey: `forum_mention:${printer}`, at: ago(8, 20) });
  push({ userId: uid("nusantaralabs"), type: "payout_paid", url: "/seller/saldo", data: { amount: 50_000, transferRef: "BCA-TRF-2609170001" }, at: ago(9), read: true });
  push({ userId: uid("nusantaralabs"), type: "product_approved", actorId: uid("tim_rilisin"), url: productUrl(kasirku.slug), data: { productTitle: kasirku.title }, at: ago(100), read: true });

  if (kancilNew.length) {
    const last = kancilNew[kancilNew.length - 1]!;
    push({ userId: uid("pixelrantau"), type: "review_new", actorId: last.userId, url: `/p/${kancil.slug}/ulasan#ulasan-${last.reviewId}`, data: { productTitle: kancil.title, rating: last.rating, snippet: last.body || null }, groupKey: `review_new:${productIds.get("kancil")}`, count: kancilNew.length, at: last.at });
  }
  push({ userId: uid("bukuterbuka"), type: "forum_accepted", actorId: uid("budi12"), url: `/forum/t/${threadIds.get("flutter")}?balasan=${flutterReplies[0]!.id}#b-${flutterReplies[0]!.id}`, data: { threadTitle: threadTitles.get("flutter")! }, at: ago(3, 20) });
  push({ userId: uid("dapurkode"), type: "forum_accepted", actorId: uid("nanda37"), url: `/forum/t/${threadIds.get("nextcache")}?balasan=${nextReplies[0]!.id}#b-${nextReplies[0]!.id}`, data: { threadTitle: threadTitles.get("nextcache")! }, at: ago(11, 20), read: true });
  push({ userId: uid("tim_rilisin"), type: "forum_reply", actorId: uid("pixelrantau"), url: `/forum/t/${threadIds.get("welcome")}`, data: { threadTitle: threadTitles.get("welcome")!, snippet: "Siap! Devlog game kami nanti ditaruh di kategori Devlog ya." }, groupKey: `forum_reply:${threadIds.get("welcome")}`, count: 2, at: ago(19, 16) });
  if (notes.length) await db.insert(schema.notifications).values(notes);

  const [{ n: threads } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.forumThreads);
  return { categories: CATEGORIES.length, threads, replies, reviews, notifications: notes.length };
}

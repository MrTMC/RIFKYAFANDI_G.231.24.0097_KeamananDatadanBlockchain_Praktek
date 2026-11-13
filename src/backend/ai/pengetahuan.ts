// RAG sederhana: pencarian kata kunci atas catatan pengetahuan lokal (tanpa database vektor).
//
// Isi catatan diambil dari aturan sistem AidTrace yang benar-benar diterapkan di kode
// (src/lib/memo.ts, src/lib/hash.ts, src/backend/service.ts). Tambahkan/ganti catatan
// dengan hasil wawancara narasumber (admin program, penerima, pihak sekolah) bila ada;
// tulis nama narasumber di field `sumber`.

export type Catatan = {
  id: string;
  judul: string;
  jenis: string;
  kata_kunci: string[];
  isi: string;
  sumber: string;
};

const SISTEM = "Aturan sistem AidTrace (kode aplikasi)";
const KEBIJAKAN = "Kebijakan program AidTrace (sesuaikan dengan narasumber)";

export const CATATAN: Catatan[] = [
  {
    id: "AT-01",
    judul: "Alur pencatatan distribusi",
    jenis: "prosedur",
    kata_kunci: ["catat", "distribusi", "admin", "hash", "alur", "dicatat"],
    isi: "Admin mencatat distribusi bantuan. Data (nominal, tanggal, periode, program, id penerima, id record, salt) diringkas jadi hash SHA-256 tanpa nama penerima, lalu hash itu dikirim ke Solana devnet sebagai memo dan ditandatangani wallet admin.",
    sumber: SISTEM,
  },
  {
    id: "AT-02",
    judul: "Konfirmasi oleh penerima",
    jenis: "prosedur",
    kata_kunci: ["konfirmasi", "penerima", "sesuai", "tidak", "diterima", "wallet"],
    isi: "Penerima mengonfirmasi dari wallet miliknya sendiri apakah dana diterima SESUAI atau TIDAK_SESUAI. Konfirmasi juga dicatat sebagai memo di devnet dan hanya sah jika ditandatangani wallet penerima yang terdaftar.",
    sumber: SISTEM,
  },
  {
    id: "AT-03",
    judul: "Status Menunggu transaksi (MENUNGGU_CHAIN)",
    jenis: "istilah",
    kata_kunci: ["status", "menunggu", "transaksi", "belum", "arti"],
    isi: "Status MENUNGGU_CHAIN (Menunggu transaksi) berarti data distribusi sudah dibuat admin tetapi transaksi memo-nya belum masuk ke Solana devnet. Distribusi dengan status ini belum tampil di audit publik.",
    sumber: SISTEM,
  },
  {
    id: "AT-07",
    judul: "Status Tercatat (TERCATAT)",
    jenis: "istilah",
    kata_kunci: ["status", "tercatat", "arti", "devnet", "terbaca"],
    isi: "Status TERCATAT berarti transaksi memo yang ditandatangani admin sudah terbaca di Solana devnet dan lolos pemeriksaan server. Penerima belum memberi konfirmasi.",
    sumber: SISTEM,
  },
  {
    id: "AT-08",
    judul: "Status Dikonfirmasi sesuai dan tidak sesuai",
    jenis: "istilah",
    kata_kunci: ["status", "dikonfirmasi", "sesuai", "dilaporkan", "tidak", "arti"],
    isi: "DIKONFIRMASI_SESUAI berarti penerima menyatakan dana diterima sesuai. DIKONFIRMASI_TIDAK_SESUAI (Dilaporkan tidak sesuai) berarti penerima melaporkan dana tidak sesuai dan perlu ditindaklanjuti admin dan penyelenggara program.",
    sumber: SISTEM,
  },
  {
    id: "AT-04",
    judul: "Cara verifikasi audit publik",
    jenis: "prosedur",
    kata_kunci: ["verifikasi", "audit", "publik", "cocok", "signer", "memo", "login"],
    isi: "Siapa pun bisa memverifikasi tanpa login. Verifikasi membaca transaksi dari devnet dan memeriksa empat hal: format memo, hash cocok dengan data saat ini, signer adalah wallet admin terdaftar, dan konfirmasi ditandatangani wallet penerima.",
    sumber: SISTEM,
  },
  {
    id: "AT-05",
    judul: "Privasi data penerima",
    jenis: "kebijakan",
    kata_kunci: ["privasi", "nama", "pribadi", "data", "rahasia", "identitas"],
    isi: "Nama penerima tidak pernah masuk hash maupun blockchain, dan tidak tampil di audit publik. Hanya admin dan penerima itu sendiri yang melihat namanya.",
    sumber: SISTEM,
  },
  {
    id: "AT-06",
    judul: "Aturan keputusan",
    jenis: "aturan",
    kata_kunci: ["palsu", "asli", "keputusan", "vonis", "sengketa", "penipuan", "laporan"],
    isi: "Tercatat di blockchain hanya berarti data tidak berubah sejak dicatat, bukan bukti bantuan benar-benar sampai. Laporan tidak sesuai dari penerima perlu ditinjau admin dan pihak penyelenggara program; AI tidak boleh memvonis penyelewengan.",
    sumber: KEBIJAKAN,
  },
  {
    id: "AT-09",
    judul: "Hash berbeda berarti data berubah",
    jenis: "indikator",
    kata_kunci: ["hash", "berbeda", "diubah", "ubah", "manipulasi", "tidak", "cocok", "edit"],
    isi: "Jika hash di memo devnet berbeda dengan hash yang dihitung ulang dari data saat ini, data distribusi telah diubah setelah dicatat. Ini indikator yang perlu diperiksa admin, bukan bukti penyelewengan.",
    sumber: SISTEM,
  },
  {
    id: "AT-10",
    judul: "Signer harus admin terdaftar",
    jenis: "indikator",
    kata_kunci: ["signer", "admin", "terdaftar", "penandatangan", "wallet", "memo", "palsu"],
    isi: "Transaksi pencatatan hanya sah jika wallet penandatangan (fee payer) adalah wallet admin terdaftar. Memo bernada sama dari wallet lain tidak dianggap sah.",
    sumber: SISTEM,
  },
  {
    id: "AT-11",
    judul: "Konfirmasi hanya sah dari wallet penerima",
    jenis: "indikator",
    kata_kunci: ["konfirmasi", "penerima", "wallet", "sah", "tanda", "tangan", "orang", "lain"],
    isi: "Konfirmasi dianggap sah hanya jika memo CONF memuat id record dan hash yang sama dan ditandatangani wallet penerima yang terdaftar untuk distribusi itu. Konfirmasi dari wallet lain ditolak.",
    sumber: SISTEM,
  },
  {
    id: "AT-12",
    judul: "Jaringan Solana devnet",
    jenis: "istilah",
    kata_kunci: ["devnet", "solana", "jaringan", "uji", "dana", "faucet", "sol"],
    isi: "AidTrace memakai Solana devnet, jaringan uji dengan SOL gratis. Tidak ada uang yang berpindah lewat aplikasi; blockchain hanya menyimpan bukti berupa memo, sedangkan dana tetap disalurkan lewat bank.",
    sumber: SISTEM,
  },
];

const KATA_UMUM = new Set([
  "yang",
  "dan",
  "dari",
  "ini",
  "itu",
  "apa",
  "apakah",
  "gimana",
  "bagaimana",
  "dengan",
  "untuk",
  "atau",
  "nggak",
  "tidak",
  "kalau",
  "ada",
  "adalah",
  "saya",
  "aku",
  "kamu",
  "bisa",
  "siapa",
  "kapan",
  "mana",
  "aidtrace",
  "bantuan",
]);

function pecah(teks: string): string[] {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((k) => k.length >= 3 && !KATA_UMUM.has(k));
}

function cocok(a: string, b: string): boolean {
  if (a === b) return true;
  const [pendek, panjang] = a.length <= b.length ? [a, b] : [b, a];
  return pendek.length >= 4 && panjang.startsWith(pendek);
}

/** Cari catatan paling relevan dari kata kunci pertanyaan. Skor 0 dibuang. */
export function cariCatatan(pertanyaan: string, maks = 3, daftar: Catatan[] = CATATAN): Catatan[] {
  const kata = pecah(pertanyaan);
  if (!kata.length) return [];
  return daftar
    .map((c) => {
      const bahan = pecah(`${c.judul} ${c.kata_kunci.join(" ")} ${c.isi}`);
      const skor = kata.filter((k) => bahan.some((b) => cocok(k, b))).length;
      return { c, skor };
    })
    .filter((x) => x.skor > 0)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, maks)
    .map((x) => x.c);
}

export function susunKonteks(daftar: Catatan[]): string {
  return daftar
    .map((c) => `[${c.id}] ${c.judul} (${c.jenis}; sumber: ${c.sumber})\n${c.isi}`)
    .join("\n\n");
}

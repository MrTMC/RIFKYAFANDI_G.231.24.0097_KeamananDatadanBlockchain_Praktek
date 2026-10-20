# AidTrace Receipt

Sistem tanda terima distribusi bantuan pendidikan berbasis wallet. Admin mencatat distribusi,
penerima mengonfirmasi dengan wallet miliknya sendiri, dan **siapa pun** dapat memverifikasi bahwa
catatan tidak diubah diam-diam — buktinya tersimpan di **Solana devnet**.

Disusun oleh **Rifky Afandi (G.231.24.0097)** — Teknik Informatika, FTIK Universitas Semarang.

> Jaringan yang dipakai adalah **Solana devnet** (jaringan uji, SOL gratis dari faucet).
> Tidak ada dana yang berpindah lewat aplikasi ini: uang tetap disalurkan lewat bank, blockchain
> hanya menyimpan **bukti**.

---

## Arsitektur

```
Browser (React)            Server (TanStack Start)              Penyimpanan
───────────────            ───────────────────────              ───────────
Phantom wallet  ──login──▶ verifikasi tanda tangan ed25519  ──▶ Supabase Postgres
                           cookie sesi httpOnly (HMAC)          (nama, wallet, record,
Phantom wallet  ──memo──▶  Solana devnet ◀── server membaca      salt, jejak audit)
                           transaksi & memeriksa memo+signer
Halaman Audit   ──────────────────────────▶ Solana devnet (verifikasi langsung, tanpa percaya server)
```

| Data | Disimpan di | Siapa yang bisa melihat |
| --- | --- | --- |
| Nama penerima | Database (server) | Admin, dan penerima itu sendiri |
| Wallet, nominal, tanggal, salt, hash, status | Database | Publik (halaman Audit) |
| `recordId` + hash + status | Solana devnet (memo) | Publik |
| Sesi login | Cookie httpOnly bertanda tangan | Browser pemilik |

**Aturan keamanan utama**

- Browser **tidak pernah** memegang kunci database. Semua baca/tulis lewat server; RLS di Supabase
  menolak akses langsung dari API publik.
- Peran (admin/penerima) ditentukan **server dari database**, setelah pengguna membuktikan
  kepemilikan wallet dengan menandatangani pesan login (domain + waktu + nonce sekali pakai).
- Distribusi & konfirmasi **baru tersimpan** setelah server membaca transaksinya di devnet dan
  memastikan memo cocok serta ditandatangani wallet yang sah (admin / penerima pemilik).
- Tidak ada data pribadi di blockchain. Hash = SHA-256 dari
  `{amount, date, period, program, recipientId, recordId, salt}`.

Ancaman yang dimitigasi: **T1** admin mengonfirmasi atas nama penerima · **T2** wallet admin /
wallet ganda didaftarkan sebagai penerima · **T3** data pribadi bocor ke chain · **T5** data diubah
setelah dicatat · **T8** phishing seed phrase · **T10** bypass peran di frontend · **T11** memo palsu.

---

## 1. Siapkan database (Supabase, gratis)

1. Daftar di <https://supabase.com> → **New project** (region: Southeast Asia/Singapore). Simpan
   password database.
2. Buka **SQL Editor** → **New query** → tempel seluruh isi [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   File ini aman dijalankan ulang: setiap kali aplikasi diperbarui dan `schema.sql` berubah,
   jalankan lagi seluruh isinya — data yang sudah ada tidak terhapus.
3. Klik **Connect** (atas halaman) → pilih **Transaction pooler** → salin URI-nya
   (port **6543**), ganti `[YOUR-PASSWORD]`. Ini nilai `DATABASE_URL`.

## 2. Jalankan di laptop

Butuh **Node.js 20.19+** (disarankan 22 LTS).

```sh
npm install
copy .env.example .env      # Windows   (macOS/Linux: cp .env.example .env)
```

Isi `.env`:

- `DATABASE_URL` — dari langkah 1
- `SESSION_SECRET` — jalankan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ADMIN_WALLETS` — alamat wallet Phantom yang menjadi admin (salin dari Phantom)

```sh
npm run dev
```

Buka alamat yang muncul (mis. `http://localhost:8080`) di **Chrome yang sudah terpasang Phantom**.

## 3. Online-kan (Vercel, gratis)

1. Push proyek ini ke GitHub (repository baru, mis. `aidtrace-receipt`).
2. Daftar di <https://vercel.com> dengan akun GitHub → **Add New → Project** → pilih repository.
3. Di **Environment Variables** isi: `DATABASE_URL`, `SESSION_SECRET` (buat yang baru, jangan sama
   dengan lokal), `ADMIN_WALLETS`, dan `APP_DOMAIN`.
4. **Deploy**. Setelah selesai, Vercel memberi alamat seperti `aidtrace-receipt.vercel.app`.
   Pastikan `APP_DOMAIN` sama persis dengan domain itu (tanpa `https://`), lalu **Redeploy**.

`vercel.json` sudah mengatur build untuk Vercel. Setiap `git push` ke branch utama otomatis
men-deploy ulang.

## 4. Persiapan wallet

1. Pasang ekstensi **Phantom**, buat 2 akun: Admin dan Penerima.
2. Phantom → Settings → Developer Settings → **Testnet Mode** → **Solana Devnet**.
3. Isi SOL devnet gratis untuk kedua akun di <https://faucet.solana.com>.

## Alur pemakaian

| # | Siapa | Langkah |
| --- | --- | --- |
| 1 | Admin | **Masuk** → Hubungkan Phantom → *Masuk dengan wallet ini* (tanda tangan pesan, tanpa biaya) |
| 2 | Admin | (Opsional) **Program** → tambah program bantuan baru atau nonaktifkan yang tidak dipakai |
| 3 | Admin | **Penerima → Tambah** → isi nama, jenjang, program, dan alamat wallet penerima |
| 4 | Admin | **Catat** → isi distribusi → *Simpan & catat ke devnet* → setujui transaksi di Phantom |
| 5 | Penerima | Masuk dengan akunnya → **Bantuan Saya** → *Sesuai* / *Tidak sesuai* → setujui di Phantom |
| 6 | Siapa pun | **Audit** (tanpa login) → *Verifikasi semua* → klik badge untuk rincian 4 pemeriksaan |

Uji deteksi perubahan (T5): ubah kolom `amount` sebuah distribusi langsung di Supabase
(**Table Editor → distributions**), lalu verifikasi ulang di halaman Audit → **Tidak cocok**.

Menambah admin lain: tambahkan alamatnya ke `ADMIN_WALLETS`, atau jalankan di SQL Editor:
`insert into admins (wallet, label) values ('ALAMAT_WALLET', 'Nama admin');`

---

## Pengujian

```sh
npm test                                   # unit test (hash, verifikasi on-chain)
TEST_DATABASE_URL=postgres://... npm test  # + uji integrasi server terhadap Postgres sungguhan
```

Uji integrasi mencakup: login sah/kedaluwarsa/domain lain/replay nonce/tanda tangan palsu, token
sesi dipalsukan, T1, T2, T11, memo palsu, transaksi gagal, kebocoran nama di data publik, dan
jejak audit. Alur lengkap UI juga sudah diuji end-to-end dengan Phantom & RPC tiruan.

## Teknologi

TanStack Start (React 19 + Vite) · Tailwind CSS · shadcn/ui · Postgres (Supabase) via `postgres` ·
`@solana/web3.js` + SPL Memo · Phantom wallet adapter · `tweetnacl` (verifikasi ed25519) · Vitest.

## Keterbatasan yang diakui

- Sistem membuktikan *pengakuan penerima*, bukan uang fisik di tangannya; konfirmasi di bawah
  tekanan atau data yang salah sejak awal tidak bisa dicegah blockchain (T6/T7).
- Devnet bisa di-reset oleh Solana; database tetap menyimpan hash & signature sebagai cadangan.
- Biaya transaksi dibayar wallet masing-masing (perlu SOL devnet dari faucet).
- Pendaftaran wallet penerima masih dilakukan admin; tahap berikutnya: penerima mendaftarkan wallet
  sendiri dengan kode verifikasi.

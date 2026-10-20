-- =====================================================================
-- AidTrace Receipt — skema database
-- Jalankan SEKALI di Supabase: Dashboard → SQL Editor → New query →
-- tempel seluruh isi file ini → Run. Aman dijalankan ulang (idempotent).
--
-- Model keamanan: HANYA server aplikasi (koneksi DATABASE_URL) yang
-- membaca/menulis tabel. RLS diaktifkan TANPA policy sehingga API publik
-- Supabase (anon key) tidak bisa mengakses data apa pun.
-- =====================================================================

-- Admin yang sah. Admin awal juga bisa diberikan lewat env ADMIN_WALLETS.
create table if not exists admins (
  wallet      text primary key,
  label       text not null default '',
  created_at  timestamptz not null default now()
);

-- Program bantuan. Admin bisa menambah & menonaktifkan program dari menu Program.
-- Program TIDAK bisa dihapus/diganti nama bila sudah dipakai (dijaga foreign key),
-- supaya hash distribusi lama tetap bisa diverifikasi di halaman Audit.
create table if not exists programs (
  name        text primary key
              check (length(name) between 2 and 40 and name !~ '[|<>"\\]' and name = btrim(name)),
  aktif       boolean not null default true,
  created_by  text not null default 'sistem',
  created_at  timestamptz not null default clock_timestamp()  -- urutan tampil = urutan dibuat
);
-- Nama program unik tanpa membedakan huruf besar/kecil ("PIP" = "pip").
create unique index if not exists programs_name_lower_uniq on programs (lower(name));
insert into programs (name) values ('PIP'), ('KIP Kuliah'), ('Beasiswa Daerah')
  on conflict do nothing;

-- Penerima. `nama` adalah data pribadi: TIDAK PERNAH dikirim ke halaman publik.
create table if not exists recipients (
  recipient_id  text primary key,                    -- REC-0001
  nama          text not null check (length(nama) between 1 and 100),
  jenjang       text not null check (jenjang in ('SD','SMP','SMA','Kuliah')),
  program       text not null references programs(name) on update restrict on delete restrict,
  wallet        text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Satu wallet hanya boleh dipakai satu penerima aktif (mitigasi T2).
create unique index if not exists recipients_wallet_aktif_uniq on recipients (wallet) where aktif;

create sequence if not exists recipient_seq;
create sequence if not exists distribution_seq;

-- Distribusi. Status MENUNGGU_CHAIN = sudah disiapkan server, transaksi
-- devnet belum diverifikasi. Hanya status selain itu yang tampil di audit.
create table if not exists distributions (
  record_id       text primary key,                  -- DIST-0001
  recipient_id    text not null references recipients(recipient_id),
  program         text not null references programs(name) on update restrict on delete restrict,
  amount          bigint not null check (amount > 0 and amount <= 1000000000),
  date            date not null,
  period          text not null check (length(period) between 1 and 40),
  salt            text not null check (salt ~ '^[0-9a-f]{32}$'),
  hash            text not null check (hash ~ '^[0-9a-f]{64}$'),
  status          text not null default 'MENUNGGU_CHAIN'
                  check (status in ('MENUNGGU_CHAIN','TERCATAT','DIKONFIRMASI_SESUAI','DIKONFIRMASI_TIDAK_SESUAI')),
  created_by      text not null,                     -- wallet admin
  dist_signature  text unique,
  recorded_at     timestamptz,
  actual_amount   bigint check (actual_amount is null or actual_amount >= 0),
  conf_signature  text unique,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists distributions_recipient_idx on distributions (recipient_id);

-- Nonce login yang sudah dipakai (mencegah replay tanda tangan login).
create table if not exists login_nonces (
  nonce       text primary key,
  wallet      text not null,
  used_at     timestamptz not null default now()
);

-- Jejak audit internal: siapa melakukan apa.
create table if not exists audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb
);

-- Migrasi untuk database yang dibuat dengan versi lama (daftar program tetap):
-- ganti CHECK 3 program menjadi foreign key ke tabel programs. Aman diulang.
do $$
begin
  alter table recipients    drop constraint if exists recipients_program_check;
  alter table distributions drop constraint if exists distributions_program_check;
  if not exists (select 1 from pg_constraint where conname = 'recipients_program_fkey') then
    alter table recipients add constraint recipients_program_fkey
      foreign key (program) references programs(name) on update restrict on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributions_program_fkey') then
    alter table distributions add constraint distributions_program_fkey
      foreign key (program) references programs(name) on update restrict on delete restrict;
  end if;
end $$;

-- Kunci semua tabel dari API publik Supabase.
alter table admins        enable row level security;
alter table programs      enable row level security;
alter table recipients    enable row level security;
alter table distributions enable row level security;
alter table login_nonces  enable row level security;
alter table audit_log     enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on admins, programs, recipients, distributions, login_nonces, audit_log from anon, authenticated;
    revoke all on sequence recipient_seq, distribution_seq from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Opsional: daftarkan wallet Phantom Anda sebagai admin di sini juga.
-- Hapus tanda "--" lalu ganti alamatnya:
-- insert into admins (wallet, label) values ('ALAMAT_WALLET_PHANTOM_ANDA', 'Admin utama')
--   on conflict do nothing;
-- ---------------------------------------------------------------------

// Logika bisnis server. Setiap fungsi menerima `sql` (koneksi DB) dan, bila
// perlu, pembaca chain — sehingga bisa diuji terhadap Postgres sungguhan.
import bs58 from "bs58";
import nacl from "tweetnacl";
import { computeHash, generateSalt } from "@/lib/hash";
import { parseLoginMessage } from "@/lib/loginMessage";
import { CONF_MEMO_RE, DIST_MEMO_RE, RECORD_ID_RE, type ConfStatus } from "@/lib/memo";
import {
  JENJANG,
  normalizeProgramName,
  PROGRAM_NAME_RE,
  type AppData,
  type Distribution,
  type Jenjang,
  type Program,
  type ProgramInfo,
  type Recipient,
  type Role,
  type Session,
  type Status,
} from "@/lib/types";
import type { Sql } from "./db";
import { envAdminWallets } from "./env";
import type { ChainTx } from "./solanaRpc";

/** Kesalahan yang aman ditampilkan ke pengguna. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export type ChainReader = (signature: string) => Promise<ChainTx | null>;

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LOGIN_MAX_AGE_MS = 5 * 60 * 1000;

export function isValidWallet(w: string): boolean {
  if (!BASE58_RE.test(w)) return false;
  try {
    return bs58.decode(w).length === 32;
  } catch {
    return false;
  }
}

async function log(sql: Sql, actor: string, action: string, detail: Record<string, unknown>) {
  await sql`insert into audit_log (actor, action, detail) values (${actor}, ${action}, ${sql.json(detail as never)})`;
}

// ------------------------------------------------------------------ peran

export async function adminWallets(sql: Sql): Promise<string[]> {
  const rows = await sql<{ wallet: string }[]>`select wallet from admins order by created_at`;
  return Array.from(new Set([...envAdminWallets(), ...rows.map((r) => r.wallet)]));
}

export async function resolveSession(sql: Sql, wallet: string | null): Promise<Session> {
  if (!wallet) return null;
  const admins = await adminWallets(sql);
  if (admins.includes(wallet)) return { wallet, role: "admin", recipientId: null };
  const [r] = await sql<{ recipient_id: string }[]>`
    select recipient_id from recipients where wallet = ${wallet} and aktif limit 1`;
  if (r) return { wallet, role: "penerima", recipientId: r.recipient_id };
  return { wallet, role: "publik", recipientId: null };
}

async function requireRole(sql: Sql, wallet: string | null, role: Role) {
  const s = await resolveSession(sql, wallet);
  if (!s) throw new UserError("Sesi berakhir. Hubungkan wallet dan masuk kembali.");
  if (s.role !== role)
    throw new UserError(`Aksi ini khusus ${role === "admin" ? "Admin" : "Penerima"}.`);
  return s;
}

// ------------------------------------------------------------------ login

export async function verifyLogin(
  sql: Sql,
  input: { message: string; signature: string },
  allowedDomains: string | string[],
  now = Date.now(),
): Promise<string> {
  const f = parseLoginMessage(input.message);
  if (!f) throw new UserError("Format pesan login tidak valid.");
  const domains = Array.isArray(allowedDomains) ? allowedDomains : [allowedDomains];
  if (!domains.includes(f.domain)) throw new UserError("Pesan login dibuat untuk domain lain.");
  const t = Date.parse(f.issuedAt);
  if (!Number.isFinite(t) || Math.abs(now - t) > LOGIN_MAX_AGE_MS)
    throw new UserError("Pesan login kedaluwarsa. Coba masuk lagi.");
  if (!isValidWallet(f.wallet)) throw new UserError("Alamat wallet tidak valid.");
  let sig: Uint8Array;
  try {
    sig = bs58.decode(input.signature);
  } catch {
    throw new UserError("Tanda tangan tidak valid.");
  }
  const ok =
    sig.length === 64 &&
    nacl.sign.detached.verify(
      Uint8Array.from(new TextEncoder().encode(input.message)),
      Uint8Array.from(sig),
      Uint8Array.from(bs58.decode(f.wallet)),
    );
  if (!ok) throw new UserError("Tanda tangan tidak cocok dengan wallet.");
  // Nonce sekali pakai (mencegah tanda tangan login dipakai ulang).
  const inserted = await sql`
    insert into login_nonces (nonce, wallet) values (${f.nonce}, ${f.wallet})
    on conflict (nonce) do nothing returning nonce`;
  if (inserted.length === 0)
    throw new UserError("Pesan login sudah pernah dipakai. Coba masuk lagi.");
  await sql`delete from login_nonces where used_at < now() - interval '1 day'`;
  await log(sql, f.wallet, "login", {});
  return f.wallet;
}

// ------------------------------------------------------------------ data

type RecipientRow = {
  recipient_id: string;
  nama: string;
  jenjang: Jenjang;
  program: Program;
  wallet: string;
  aktif: boolean;
};
type DistRow = {
  record_id: string;
  recipient_id: string;
  program: Program;
  amount: number;
  date: string;
  period: string;
  salt: string;
  hash: string;
  dist_signature: string | null;
  status: Status;
  created_by: string;
  actual_amount: number | null;
  conf_signature: string | null;
};

const toRecipient = (r: RecipientRow, withName: boolean): Recipient => ({
  recipientId: r.recipient_id,
  ...(withName ? { nama: r.nama } : {}),
  jenjang: r.jenjang,
  program: r.program,
  walletAddress: r.wallet,
  aktif: r.aktif,
});
const toDistribution = (d: DistRow): Distribution => ({
  recordId: d.record_id,
  recipientId: d.recipient_id,
  program: d.program,
  amount: Number(d.amount),
  date: d.date,
  period: d.period,
  salt: d.salt,
  hash: d.hash,
  distSignature: d.dist_signature,
  status: d.status,
  createdBy: d.created_by,
  ...(d.actual_amount != null ? { actualAmount: Number(d.actual_amount) } : {}),
  ...(d.conf_signature ? { confSignature: d.conf_signature } : {}),
});

const DIST_COLS = (sql: Sql) => sql`
  record_id, recipient_id, program, amount::int as amount, date::text as date, period, salt, hash,
  dist_signature, status, created_by, actual_amount::int as actual_amount, conf_signature`;

/**
 * Data sesuai peran:
 *  - publik  : distribusi yang sudah tercatat on-chain, penerima TANPA nama
 *  - penerima: + data dirinya sendiri (termasuk nama)
 *  - admin   : semua, termasuk nama & distribusi yang menunggu transaksi
 */
export async function loadData(sql: Sql, wallet: string | null): Promise<AppData> {
  const session = await resolveSession(sql, wallet);
  const admins = await adminWallets(sql);
  const programs = await listPrograms(sql);
  const isAdmin = session?.role === "admin";
  const recRows = await sql<RecipientRow[]>`
    select recipient_id, nama, jenjang, program, wallet, aktif from recipients order by recipient_id`;
  const distRows = isAdmin
    ? await sql<DistRow[]>`select ${DIST_COLS(sql)} from distributions order by record_id`
    : await sql<
        DistRow[]
      >`select ${DIST_COLS(sql)} from distributions where status <> 'MENUNGGU_CHAIN' order by record_id`;
  return {
    session,
    admins,
    programs,
    recipients: recRows.map((r) =>
      toRecipient(r, isAdmin || r.recipient_id === session?.recipientId),
    ),
    distributions: distRows.map(toDistribution),
  };
}

// ------------------------------------------------------------------ program (admin)

export async function listPrograms(sql: Sql): Promise<ProgramInfo[]> {
  return sql<ProgramInfo[]>`select name, aktif from programs order by created_at, name`;
}

async function requireProgram(sql: Sql, name: string, opts: { allowInactive: boolean }) {
  const [p] = await sql<{ aktif: boolean }[]>`select aktif from programs where name = ${name}`;
  if (!p) throw new UserError("Program tidak valid.");
  if (!p.aktif && !opts.allowInactive)
    throw new UserError(`Program "${name}" sedang nonaktif. Aktifkan dulu di menu Program.`);
}

export async function createProgram(sql: Sql, actor: string | null, rawName: string) {
  const s = await requireRole(sql, actor, "admin");
  const name = normalizeProgramName(rawName);
  if (!PROGRAM_NAME_RE.test(name))
    throw new UserError(
      "Nama program 2–40 karakter: huruf, angka, spasi, dan tanda . , ' ( ) / & + - saja.",
    );
  const [dup] = await sql<{ name: string }[]>`
    select name from programs where lower(name) = lower(${name})`;
  if (dup) throw new UserError(`Program "${dup.name}" sudah ada.`);
  try {
    await sql`insert into programs (name, created_by) values (${name}, ${s.wallet})`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new UserError("Program sudah ada.");
    throw e;
  }
  await log(sql, s.wallet, "program.create", { name });
  return name;
}

export async function setProgramActive(
  sql: Sql,
  actor: string | null,
  name: string,
  aktif: boolean,
) {
  const s = await requireRole(sql, actor, "admin");
  const rows = await sql`update programs set aktif = ${aktif} where name = ${name} returning name`;
  if (!rows.length) throw new UserError("Program tidak ditemukan.");
  await log(sql, s.wallet, aktif ? "program.activate" : "program.deactivate", { name });
}

// ------------------------------------------------------------------ penerima (admin)

export type RecipientInput = {
  recipientId?: string | undefined;
  nama: string;
  jenjang: string;
  program: string;
  walletAddress: string;
  aktif: boolean;
};

export async function saveRecipient(sql: Sql, actor: string | null, input: RecipientInput) {
  const s = await requireRole(sql, actor, "admin");
  const nama = input.nama.trim();
  const wallet = input.walletAddress.trim();
  if (!nama || nama.length > 100) throw new UserError("Nama wajib diisi (maks. 100 karakter).");
  if (!JENJANG.includes(input.jenjang as Jenjang)) throw new UserError("Jenjang tidak valid.");
  if (!isValidWallet(wallet)) throw new UserError("Alamat wallet Solana tidak valid.");
  // Program nonaktif tidak bisa dipilih untuk penerima baru / perubahan program,
  // tetapi penerima lama yang programnya dinonaktifkan tetap bisa diubah datanya.
  let keepsOldProgram = false;
  if (input.recipientId) {
    const [old] = await sql<{ program: string }[]>`
      select program from recipients where recipient_id = ${input.recipientId}`;
    keepsOldProgram = old?.program === input.program;
  }
  await requireProgram(sql, input.program, { allowInactive: keepsOldProgram });
  if ((await adminWallets(sql)).includes(wallet))
    throw new UserError("Wallet admin tidak boleh didaftarkan sebagai penerima (mitigasi T2).");
  try {
    if (input.recipientId) {
      const rows = await sql`
        update recipients set nama = ${nama}, jenjang = ${input.jenjang}, program = ${input.program},
          wallet = ${wallet}, aktif = ${input.aktif}, updated_at = now()
        where recipient_id = ${input.recipientId} returning recipient_id`;
      if (!rows.length) throw new UserError("Penerima tidak ditemukan.");
      await log(sql, s.wallet, "recipient.update", {
        recipientId: input.recipientId,
        wallet,
        aktif: input.aktif,
      });
      return input.recipientId;
    }
    const [row] = await sql<{ recipient_id: string }[]>`
      insert into recipients (recipient_id, nama, jenjang, program, wallet, aktif)
      values ('REC-' || lpad(nextval('recipient_seq')::text, 4, '0'), ${nama}, ${input.jenjang}, ${input.program}, ${wallet}, ${input.aktif})
      returning recipient_id`;
    await log(sql, s.wallet, "recipient.create", { recipientId: row!.recipient_id, wallet });
    return row!.recipient_id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new UserError("Wallet ini sudah dipakai penerima aktif lain (mitigasi T2).");
    throw e;
  }
}

// ------------------------------------------------------------------ distribusi (admin)

export type DistributionInput = {
  recipientId: string;
  program: string;
  amount: number;
  date: string;
  period: string;
};

export async function prepareDistribution(
  sql: Sql,
  actor: string | null,
  input: DistributionInput,
) {
  const s = await requireRole(sql, actor, "admin");
  const amount = Number(input.amount);
  const period = input.period.trim();
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000_000)
    throw new UserError("Nominal harus bilangan bulat antara 1 dan 1.000.000.000.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)))
    throw new UserError("Tanggal tidak valid.");
  if (!period || period.length > 40)
    throw new UserError("Periode wajib diisi (maks. 40 karakter).");
  const [rec] = await sql<
    { aktif: boolean; program: string }[]
  >`select aktif, program from recipients where recipient_id = ${input.recipientId}`;
  if (!rec) throw new UserError("Penerima tidak ditemukan.");
  if (!rec.aktif) throw new UserError("Penerima tidak aktif.");
  // Program distribusi WAJIB sama dengan program yang terdaftar untuk penerima.
  if (input.program !== rec.program)
    throw new UserError(
      `Program harus sesuai data penerima (${input.recipientId}: ${rec.program}).`,
    );
  await requireProgram(sql, rec.program, { allowInactive: false });

  const [idRow] = await sql<
    { id: string }[]
  >`select 'DIST-' || lpad(nextval('distribution_seq')::text, 4, '0') as id`;
  const recordId = idRow!.id;
  const salt = generateSalt();
  const hash = await computeHash({
    amount,
    date: input.date,
    period,
    program: input.program,
    recipientId: input.recipientId,
    recordId,
    salt,
  });
  await sql`
    insert into distributions (record_id, recipient_id, program, amount, date, period, salt, hash, created_by)
    values (${recordId}, ${input.recipientId}, ${input.program}, ${amount}, ${input.date}, ${period}, ${salt}, ${hash}, ${s.wallet})`;
  await log(sql, s.wallet, "distribution.prepare", { recordId });
  return { recordId, hash };
}

export async function finalizeDistribution(
  sql: Sql,
  actor: string | null,
  input: { recordId: string; signature: string },
  readChain: ChainReader,
) {
  const s = await requireRole(sql, actor, "admin");
  if (!RECORD_ID_RE.test(input.recordId)) throw new UserError("Record tidak valid.");
  const [d] = await sql<{ hash: string; status: Status }[]>`
    select hash, status from distributions where record_id = ${input.recordId}`;
  if (!d) throw new UserError("Distribusi tidak ditemukan.");
  if (d.status !== "MENUNGGU_CHAIN") throw new UserError("Distribusi ini sudah tercatat.");

  const tx = await readChain(input.signature);
  if (!tx)
    throw new UserError("Transaksi belum ditemukan di devnet. Tunggu sebentar lalu coba lagi.");
  if (tx.failed) throw new UserError("Transaksi gagal di chain.");
  const m = DIST_MEMO_RE.exec(tx.memo);
  if (!m || m[1] !== input.recordId || m[2] !== d.hash) {
    console.warn("[AidTrace] memo DIST tidak cocok", {
      recordId: input.recordId,
      expected: d.hash,
      found: tx.memo,
    });
    throw new UserError(
      `Memo transaksi tidak sesuai dengan ${input.recordId}. Terbaca: "${tx.memo.slice(0, 120) || "(tidak ada memo AIDTRACE)"}".`,
    );
  }
  if (tx.feePayer !== s.wallet || !tx.signers.includes(s.wallet))
    throw new UserError("Transaksi tidak ditandatangani oleh wallet admin yang sedang masuk.");

  const rows = await sql`
    update distributions set status = 'TERCATAT', dist_signature = ${input.signature}, recorded_at = now()
    where record_id = ${input.recordId} and status = 'MENUNGGU_CHAIN' returning record_id`;
  if (!rows.length) throw new UserError("Distribusi ini sudah tercatat.");
  await log(sql, s.wallet, "distribution.record", {
    recordId: input.recordId,
    signature: input.signature,
  });
}

export async function cancelDistribution(sql: Sql, actor: string | null, recordId: string) {
  const s = await requireRole(sql, actor, "admin");
  const rows = await sql`
    delete from distributions where record_id = ${recordId} and status = 'MENUNGGU_CHAIN' returning record_id`;
  if (!rows.length)
    throw new UserError("Hanya distribusi yang belum tercatat yang bisa dibatalkan.");
  await log(sql, s.wallet, "distribution.cancel", { recordId });
}

// ------------------------------------------------------------------ konfirmasi (penerima)

export async function finalizeConfirmation(
  sql: Sql,
  actor: string | null,
  input: { recordId: string; status: ConfStatus; actualAmount: number; signature: string },
  readChain: ChainReader,
) {
  const s = await requireRole(sql, actor, "penerima");
  if (!RECORD_ID_RE.test(input.recordId)) throw new UserError("Record tidak valid.");
  if (input.status !== "SESUAI" && input.status !== "TIDAK_SESUAI")
    throw new UserError("Status tidak valid.");
  const [d] = await sql<{ hash: string; status: Status; recipient_id: string; amount: number }[]>`
    select hash, status, recipient_id, amount::int as amount from distributions where record_id = ${input.recordId}`;
  if (!d) throw new UserError("Distribusi tidak ditemukan.");
  if (d.recipient_id !== s.recipientId)
    throw new UserError("Distribusi ini bukan milik wallet Anda.");
  if (d.status !== "TERCATAT")
    throw new UserError("Distribusi ini sudah dikonfirmasi atau belum tercatat.");

  let actualAmount = d.amount;
  if (input.status === "TIDAK_SESUAI") {
    actualAmount = Number(input.actualAmount);
    if (!Number.isInteger(actualAmount) || actualAmount < 0 || actualAmount > 1_000_000_000)
      throw new UserError("Nominal yang diterima harus bilangan bulat ≥ 0.");
    if (actualAmount === d.amount)
      throw new UserError('Nominal sama dengan nominal resmi — pilih "Sesuai".');
  }

  const tx = await readChain(input.signature);
  if (!tx)
    throw new UserError("Transaksi belum ditemukan di devnet. Tunggu sebentar lalu coba lagi.");
  if (tx.failed) throw new UserError("Transaksi gagal di chain.");
  const m = CONF_MEMO_RE.exec(tx.memo);
  if (!m || m[1] !== input.recordId || m[2] !== d.hash || m[3] !== input.status) {
    console.warn("[AidTrace] memo CONF tidak cocok", {
      recordId: input.recordId,
      expected: d.hash,
      found: tx.memo,
    });
    throw new UserError(
      `Memo konfirmasi tidak sesuai dengan ${input.recordId}. Terbaca: "${tx.memo.slice(0, 120) || "(tidak ada memo AIDTRACE)"}".`,
    );
  }
  if (!tx.signers.includes(s.wallet))
    throw new UserError("Konfirmasi tidak ditandatangani wallet penerima.");

  const newStatus: Status =
    input.status === "SESUAI" ? "DIKONFIRMASI_SESUAI" : "DIKONFIRMASI_TIDAK_SESUAI";
  const rows = await sql`
    update distributions set status = ${newStatus}, actual_amount = ${actualAmount},
      conf_signature = ${input.signature}, confirmed_at = now()
    where record_id = ${input.recordId} and status = 'TERCATAT' returning record_id`;
  if (!rows.length) throw new UserError("Distribusi ini sudah dikonfirmasi.");
  await log(sql, s.wallet, "distribution.confirm", {
    recordId: input.recordId,
    status: input.status,
  });
}

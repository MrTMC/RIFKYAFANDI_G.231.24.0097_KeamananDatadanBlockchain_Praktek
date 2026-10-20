// Tipe data yang dikirim server → browser. Tanpa kode server di file ini.

export type Jenjang = "SD" | "SMP" | "SMA" | "Kuliah";
/** Nama program bantuan — daftarnya dikelola admin (tabel `programs`). */
export type Program = string;
export type ProgramInfo = { name: string; aktif: boolean };
export type Status =
  "MENUNGGU_CHAIN" | "TERCATAT" | "DIKONFIRMASI_SESUAI" | "DIKONFIRMASI_TIDAK_SESUAI";
export type Role = "admin" | "penerima" | "publik";

/** Aturan nama program (sama dengan pengecekan di server & database). */
export const PROGRAM_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'()/&+-]{1,39}$/u;
export const normalizeProgramName = (s: string) => s.trim().replace(/\s+/g, " ");
export const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "Kuliah"];

export type Recipient = {
  recipientId: string;
  /** Hanya terisi untuk admin dan untuk penerima itu sendiri. */
  nama?: string;
  jenjang: Jenjang;
  program: Program;
  walletAddress: string;
  aktif: boolean;
};

export type Distribution = {
  recordId: string;
  recipientId: string;
  program: Program;
  amount: number;
  date: string; // YYYY-MM-DD
  period: string;
  salt: string;
  hash: string;
  distSignature: string | null;
  status: Status;
  createdBy: string;
  actualAmount?: number;
  confSignature?: string;
};

export type Session = { wallet: string; role: Role; recipientId: string | null } | null;

export type AppData = {
  session: Session;
  admins: string[];
  programs: ProgramInfo[];
  recipients: Recipient[];
  distributions: Distribution[];
};

export type RecipientDraft = {
  recipientId?: string;
  nama: string;
  jenjang: Jenjang;
  program: Program;
  walletAddress: string;
  aktif: boolean;
};

export type DistributionDraft = {
  recipientId: string;
  program: Program;
  amount: number;
  date: string;
  period: string;
};

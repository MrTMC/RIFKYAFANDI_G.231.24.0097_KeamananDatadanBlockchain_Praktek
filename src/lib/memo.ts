// Hanya dua format memo yang diizinkan dikirim ke chain. Dipakai browser & server.
import bs58 from "bs58";

/**
 * Program Memo resmi Solana.
 *  - v3 (MemoSq4gq…): dikenali RPC & Explorer (teks memo tampil) — DIPAKAI untuk mengirim.
 *  - v4 (Memo4c2p…): implementasi baru (pinocchio) yang dipakai @solana/spl-memo ≥ 0.3;
 *    belum di-parse RPC/Explorer ("Unknown Program"), tetapi tetap DITERIMA saat membaca.
 *  - v1 (Memo1Uhk…): versi lama, diterima saat membaca.
 */
export const MEMO_PROGRAM_V3 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const MEMO_PROGRAM_V4 = "Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH";
export const MEMO_PROGRAM_V1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
export const MEMO_PROGRAMS: ReadonlySet<string> = new Set([
  MEMO_PROGRAM_V3,
  MEMO_PROGRAM_V4,
  MEMO_PROGRAM_V1,
]);

/**
 * Teks memo dari satu instruksi hasil `jsonParsed`: memakai `parsed` (string) bila RPC
 * mengenali programnya, selain itu mendekode `data` (base58 → UTF-8) — cara ini tidak
 * bergantung pada format log yang bisa berbeda antar versi program.
 */
export function memoFromInstruction(ix: {
  programId?: unknown;
  parsed?: unknown;
  data?: unknown;
}): string | null {
  const pid = typeof ix.programId === "string" ? ix.programId : String(ix.programId ?? "");
  if (!MEMO_PROGRAMS.has(pid)) return null;
  if (typeof ix.parsed === "string") return ix.parsed;
  if (typeof ix.data === "string") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bs58.decode(ix.data));
    } catch {
      return null;
    }
  }
  return null;
}
export const RECORD_ID_RE = /^DIST-\d{4,}$/;
export const MEMO_REGEX =
  /^AIDTRACE\|v1\|(?:DIST\|DIST-\d{4,}\|[0-9a-f]{64}|CONF\|DIST-\d{4,}\|[0-9a-f]{64}\|(?:SESUAI|TIDAK_SESUAI))$/;
export const DIST_MEMO_RE = /^AIDTRACE\|v1\|DIST\|(DIST-\d{4,})\|([0-9a-f]{64})$/;
export const CONF_MEMO_RE =
  /^AIDTRACE\|v1\|CONF\|(DIST-\d{4,})\|([0-9a-f]{64})\|(SESUAI|TIDAK_SESUAI)$/;

export type ConfStatus = "SESUAI" | "TIDAK_SESUAI";

export function assertValidMemo(memo: string) {
  if (!MEMO_REGEX.test(memo)) throw new Error("Format memo tidak valid — transaksi dibatalkan.");
}
export const distMemo = (recordId: string, hash: string) => `AIDTRACE|v1|DIST|${recordId}|${hash}`;
export const confMemo = (recordId: string, hash: string, s: ConfStatus) =>
  `AIDTRACE|v1|CONF|${recordId}|${hash}|${s}`;

export function translateError(e: unknown): string {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (
    /reject|denied|cancel|WalletSignTransactionError|WalletSendTransactionError.*User|WalletSignMessageError/i.test(
      msg,
    )
  )
    return "Permintaan ditolak di wallet.";
  if (/insufficient|debit an account|no record of a prior credit|0x1\b/i.test(msg))
    return "Saldo SOL devnet tidak cukup untuk biaya transaksi. Ambil SOL devnet gratis di faucet.solana.com.";
  if (
    /timeout|timed out|TransactionExpired|block height exceeded|Failed to fetch|NetworkError|429|503|ECONN/i.test(
      msg,
    )
  )
    return "Jaringan Solana devnet (RPC) tidak merespons / timeout. Coba lagi beberapa saat.";
  if (/Format memo|Wallet|Saldo|hanya/i.test(msg) && e instanceof Error) return e.message;
  return "Transaksi gagal: " + (e instanceof Error ? e.message : "kesalahan tidak dikenal");
}

/** Ambil teks memo dari baris log program Memo: `Program log: Memo (len 87): "..."`. */
export function memosFromLogs(logs: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const l of logs ?? []) {
    const m = /Memo \(len \d+\): "(.*)"$/.exec(l);
    if (m) out.push(m[1]!.replace(/\\"/g, '"'));
  }
  return out;
}

/**
 * Pilih memo AIDTRACE dari semua memo dalam transaksi. Wallet (mis. Phantom) bisa
 * menambahkan instruksi lain; yang diterima hanya jika ada tepat SATU memo AIDTRACE.
 * Bila tidak ada, kembalikan memo pertama (untuk pesan error) atau "".
 */
export function pickAidtraceMemo(candidates: readonly string[]): string {
  const ours = Array.from(new Set(candidates.filter((c) => c.startsWith("AIDTRACE|"))));
  if (ours.length === 1) return ours[0]!;
  if (ours.length > 1) return "";
  return candidates[0] ?? "";
}

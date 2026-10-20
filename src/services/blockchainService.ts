// SATU-SATUNYA pintu akses blockchain: Solana DEVNET melalui SPL Memo.
// web3.js di-import secara dinamis agar tidak ikut dievaluasi saat SSR.
import { Buffer } from "buffer";
import { getBridge } from "@/lib/solanaBridge";
import {
  assertValidMemo,
  confMemo,
  distMemo,
  MEMO_PROGRAM_V3,
  memoFromInstruction,
  memosFromLogs,
  pickAidtraceMemo,
  translateError,
} from "@/lib/memo";

const RPC_TIMEOUT_MS = 45_000;

// import.meta.env.SSR adalah konstanta saat build: di bundle server cabang import
// dibuang seluruhnya, sehingga web3.js (dan rpc-websockets) tidak ikut ke server
// Cloudflare yang tidak mendukungnya. Blockchain hanya dipakai di browser.
const loadSolana = import.meta.env.SSR
  ? null
  : async () => {
      await import("@/lib/polyfills");
      return import("@solana/web3.js");
    };

async function web3() {
  if (!loadSolana) throw new Error("Akses blockchain hanya tersedia di browser.");
  return loadSolana();
}

let conn: import("@solana/web3.js").Connection | null = null;
async function connection() {
  const w = await web3();
  const rpc =
    (import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined) || w.clusterApiUrl("devnet");
  if (!conn) conn = new w.Connection(rpc, "confirmed");
  return { w, c: conn };
}

function withTimeout<T>(p: Promise<T>, ms = RPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("RPC timeout")), ms)),
  ]);
}

// Hak akses (admin/penerima) diperiksa server saat transaksi diverifikasi;
// di sini hanya memastikan format memo benar sebelum dikirim.
async function sendMemo(memo: string): Promise<{ signature: string }> {
  assertValidMemo(memo);
  const b = getBridge();
  if (!b.publicKey || !b.sendTransaction)
    throw new Error("Wallet belum terhubung. Hubungkan Phantom terlebih dahulu.");
  try {
    const { w, c } = await connection();
    const payer = new w.PublicKey(b.publicKey);
    const balance = await withTimeout(c.getBalance(payer));
    if (balance === 0)
      throw new Error(
        "Saldo 0 SOL. Ambil SOL devnet gratis (bukan uang nyata) di faucet.solana.com.",
      );
    const { blockhash, lastValidBlockHeight } = await withTimeout(
      c.getLatestBlockhash("confirmed"),
    );
    // Instruksi memo dibuat langsung ke program Memo v3 resmi (dikenali RPC & Explorer).
    // Catatan: @solana/spl-memo ≥ 0.3 mengarah ke Memo v4 yang belum di-parse Explorer.
    const memoIx = new w.TransactionInstruction({
      programId: new w.PublicKey(MEMO_PROGRAM_V3),
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    });
    const tx = new w.Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(memoIx);
    const signature = await b.sendTransaction(tx, c);
    const res = await withTimeout(
      c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed"),
    );
    if (res.value.err)
      throw new Error("Transaksi gagal di chain: " + JSON.stringify(res.value.err));
    void refreshBalance();
    return { signature };
  } catch (e) {
    throw new Error(translateError(e));
  }
}

export function recordDistribution(recordId: string, hash: string) {
  return sendMemo(distMemo(recordId, hash));
}

export function confirmReceipt(recordId: string, hash: string, status: "SESUAI" | "TIDAK_SESUAI") {
  return sendMemo(confMemo(recordId, hash, status));
}

export async function getRecordOnChain(
  signature: string,
): Promise<{ memo: string; signer: string; blockTime: number } | null> {
  try {
    const { w, c } = await connection();
    const tx = await withTimeout(
      c.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 }),
    );
    if (!tx) return null;
    const fromIx: string[] = [];
    for (const ix of tx.transaction.message.instructions) {
      const m = memoFromInstruction({
        programId: ix.programId.toBase58(),
        parsed: "parsed" in ix ? ix.parsed : undefined,
        data: "data" in ix ? ix.data : undefined,
      });
      if (m !== null) fromIx.push(m);
    }
    const memo = pickAidtraceMemo([...fromIx, ...memosFromLogs(tx.meta?.logMessages)]);
    const signer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? "";
    return { memo, signer, blockTime: tx.blockTime ?? 0 };
  } catch (e) {
    // Signature dummy/seed bukan base58 valid di chain → dianggap tidak ditemukan.
    if (/invalid|WrongSize|Invalid param/i.test(String(e))) return null;
    throw new Error(translateError(e));
  }
}

export async function refreshBalance() {
  const b = getBridge();
  if (!b.publicKey) return;
  try {
    const { w, c } = await connection();
    const lamports = await withTimeout(c.getBalance(new w.PublicKey(b.publicKey)), 15_000);
    const { setBridge } = await import("@/lib/solanaBridge");
    if (getBridge().publicKey === b.publicKey) setBridge({ balanceLamports: lamports });
  } catch {
    /* saldo tidak kritis; abaikan */
  }
}

export const explorerUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

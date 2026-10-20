// Membaca transaksi dari Solana (devnet) via JSON-RPC biasa — tanpa web3.js,
// agar ringan dan berjalan di runtime server mana pun (Node/Vercel/Cloudflare).
import { memoFromInstruction, memosFromLogs, pickAidtraceMemo } from "@/lib/memo";
import { solanaRpcUrl } from "./env";

export type ChainTx = {
  memo: string;
  feePayer: string;
  signers: string[];
  failed: boolean;
  blockTime: number | null;
};

type RpcFetch = (url: string, init: RequestInit) => Promise<Response>;

type ParsedIx = { programId?: string; parsed?: unknown; data?: unknown };
type ParsedTx = {
  blockTime?: number | null;
  meta?: { err?: unknown; logMessages?: string[] | null } | null;
  transaction?: {
    message?: { accountKeys?: { pubkey: string; signer: boolean }[]; instructions?: ParsedIx[] };
  };
};

export function parseChainTx(r: ParsedTx | null): ChainTx | null {
  if (!r?.transaction?.message) return null;
  const keys = r.transaction.message.accountKeys ?? [];
  const fromIx = (r.transaction.message.instructions ?? [])
    .map((ix) => memoFromInstruction(ix))
    .filter((m): m is string => m !== null);
  // Memo dari instruksi ter-parse + dari log program Memo (cadangan bila format RPC berbeda).
  return {
    memo: pickAidtraceMemo([...fromIx, ...memosFromLogs(r.meta?.logMessages)]),
    feePayer: keys[0]?.pubkey ?? "",
    signers: keys.filter((k) => k.signer).map((k) => k.pubkey),
    failed: r.meta?.err != null,
    blockTime: r.blockTime ?? null,
  };
}

/**
 * Ambil transaksi berdasarkan signature. Transaksi yang baru dikirim kadang
 * belum terbaca RPC, jadi dicoba ulang beberapa kali.
 */
export async function getChainTx(
  signature: string,
  opts: { attempts?: number; delayMs?: number; fetchImpl?: RpcFetch; url?: string } = {},
): Promise<ChainTx | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return null;
  const { attempts = 8, delayMs = 1500, fetchImpl = fetch, url = solanaRpcUrl() } = opts;
  for (let i = 0; i < attempts; i++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    if (!res.ok) throw new Error(`RPC Solana error HTTP ${res.status}`);
    const body = (await res.json()) as { result?: ParsedTx | null; error?: { message?: string } };
    if (body.error) {
      if (/invalid|WrongSize/i.test(body.error.message ?? "")) return null;
      throw new Error(`RPC Solana: ${body.error.message ?? "error"}`);
    }
    if (body.result) return parseChainTx(body.result);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

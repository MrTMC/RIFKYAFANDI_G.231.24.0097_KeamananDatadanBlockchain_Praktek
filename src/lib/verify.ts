// Verifikasi on-chain untuk halaman Audit Publik (mitigasi T5 dan T11).
// Berjalan di BROWSER pengguna, langsung ke Solana devnet — auditor tidak perlu
// mempercayai server AidTrace.
//
// Satu distribusi dinyatakan "Cocok" hanya jika:
//   1. Format memo  — transaksi DIST ada di devnet, memo berformat DIST, recordId sama
//   2. Hash cocok   — hash di memo = hash yang dihitung ulang dari data SAAT INI
//   3. Signer admin — transaksi DIST ditandatangani wallet admin terdaftar
//   4. Konfirmasi   — jika ada konfirmasi: memo CONF valid, hash & status sama,
//                     dan ditandatangani wallet penerima distribusi tersebut
import { useSyncExternalStore } from "react";
import { computeHash } from "@/lib/hash";
import { CONF_MEMO_RE, DIST_MEMO_RE, type ConfStatus } from "@/lib/memo";
import type { Distribution, Status } from "@/lib/types";
import { getRecordOnChain } from "@/services/blockchainService";

export type CheckState = "ok" | "fail" | "skip";
export type Check = { label: string; state: CheckState; detail: string };
export type Verdict = "cocok" | "tidak_cocok" | "error";
export type VerifyResult = { verdict: Verdict; summary: string; checks: Check[] };

const CONF_STATUS: Record<ConfStatus, Status> = {
  SESUAI: "DIKONFIRMASI_SESUAI",
  TIDAK_SESUAI: "DIKONFIRMASI_TIDAK_SESUAI",
};
const short = (a: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");
type OnChain = Awaited<ReturnType<typeof getRecordOnChain>>;

export async function verifyDistribution(
  d: Distribution,
  recipientWallet: string | null,
  admins: string[],
): Promise<VerifyResult> {
  if (!d.distSignature) {
    return { verdict: "error", summary: "Distribusi ini belum dikirim ke devnet.", checks: [] };
  }
  const current = await computeHash(d);

  let dist: OnChain;
  try {
    dist = await getRecordOnChain(d.distSignature);
  } catch (e) {
    return {
      verdict: "error",
      summary: e instanceof Error ? e.message : "RPC devnet tidak merespons.",
      checks: [],
    };
  }

  const checks: Check[] = [];

  // 1. Format memo
  const m = dist ? DIST_MEMO_RE.exec(dist.memo) : null;
  if (!dist)
    checks.push({
      label: "Format memo",
      state: "fail",
      detail: "Transaksi DIST tidak ditemukan di devnet.",
    });
  else if (!m)
    checks.push({
      label: "Format memo",
      state: "fail",
      detail: `Memo bukan format AIDTRACE DIST: "${dist.memo.slice(0, 60)}"`,
    });
  else if (m[1] !== d.recordId)
    checks.push({
      label: "Format memo",
      state: "fail",
      detail: `Memo milik ${m[1]}, bukan ${d.recordId}.`,
    });
  else
    checks.push({ label: "Format memo", state: "ok", detail: `AIDTRACE|v1|DIST|${d.recordId}|…` });

  // 2. Hash cocok (data saat ini vs hash yang terkunci di chain)
  const chainHash = m?.[2] ?? null;
  if (!chainHash)
    checks.push({
      label: "Hash cocok",
      state: "fail",
      detail: "Tidak ada hash on-chain untuk dibandingkan.",
    });
  else if (chainHash !== current)
    checks.push({
      label: "Hash cocok",
      state: "fail",
      detail: `Hash on-chain ${short(chainHash)} ≠ hash data saat ini ${short(current)}. Data telah diubah.`,
    });
  else
    checks.push({
      label: "Hash cocok",
      state: "ok",
      detail: `Hash data saat ini = hash on-chain (${short(current)}).`,
    });

  // 3. Signer admin sah (mencegah memo palsu dari wallet sembarang — T11)
  if (!dist)
    checks.push({
      label: "Signer admin sah",
      state: "fail",
      detail: "Tidak ada transaksi untuk diperiksa.",
    });
  else if (!admins.includes(dist.signer))
    checks.push({
      label: "Signer admin sah",
      state: "fail",
      detail: `Ditandatangani ${short(dist.signer)} yang bukan wallet admin terdaftar.`,
    });
  else
    checks.push({
      label: "Signer admin sah",
      state: "ok",
      detail: `Ditandatangani admin ${short(dist.signer)}.`,
    });

  // 4. Konfirmasi oleh penerima sah
  if (!d.confSignature) {
    checks.push({
      label: "Konfirmasi oleh penerima sah",
      state: "skip",
      detail: "Belum dikonfirmasi penerima.",
    });
  } else {
    let conf: OnChain = null;
    try {
      conf = await getRecordOnChain(d.confSignature);
    } catch (e) {
      return {
        verdict: "error",
        summary: e instanceof Error ? e.message : "RPC devnet tidak merespons.",
        checks,
      };
    }
    const c = conf ? CONF_MEMO_RE.exec(conf.memo) : null;
    let fail: string | null = null;
    if (!conf) fail = "Transaksi CONF tidak ditemukan di devnet.";
    else if (!c) fail = "Memo konfirmasi bukan format AIDTRACE CONF.";
    else if (c[1] !== d.recordId) fail = `Konfirmasi milik ${c[1]}, bukan ${d.recordId}.`;
    else if (c[2] !== current) fail = "Hash di memo konfirmasi berbeda dari hash data saat ini.";
    else if (CONF_STATUS[c[3] as ConfStatus] !== d.status)
      fail = `Status on-chain ${c[3]} berbeda dari status tercatat.`;
    else if (!recipientWallet) fail = "Wallet penerima tidak terdaftar.";
    else if (conf.signer !== recipientWallet)
      fail = `Ditandatangani ${short(conf.signer)}, bukan wallet penerima ${short(recipientWallet)}.`;
    checks.push(
      fail
        ? { label: "Konfirmasi oleh penerima sah", state: "fail", detail: fail }
        : {
            label: "Konfirmasi oleh penerima sah",
            state: "ok",
            detail: `${c![3]} — ditandatangani penerima ${short(recipientWallet!)}.`,
          },
    );
  }

  const failed = checks.filter((x) => x.state === "fail");
  return failed.length
    ? { verdict: "tidak_cocok", summary: failed.map((x) => x.detail).join(" "), checks }
    : {
        verdict: "cocok",
        summary: d.confSignature
          ? "Semua pemeriksaan lolos."
          : "Pencatatan sah; menunggu konfirmasi penerima.",
        checks,
      };
}

// ---- Penyimpanan hasil verifikasi (dibagi antara tombol per baris & "Verifikasi semua") ----

type Entry = { fp: string; busy: boolean; result: VerifyResult | null };
let entries: Record<string, Entry> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const put = (id: string, e: Entry) => {
  entries = { ...entries, [id]: e };
  emit();
};

/** Sidik jari data: jika data berubah, hasil verifikasi lama otomatis kedaluwarsa. */
export const fingerprint = (d: Distribution, wallet: string | null) =>
  [
    d.amount,
    d.date,
    d.period,
    d.program,
    d.recipientId,
    d.salt,
    d.hash,
    d.distSignature ?? "",
    d.confSignature ?? "",
    d.status,
    wallet ?? "",
  ].join("|");

export function useVerifyEntry(d: Distribution, wallet: string | null): Entry | null {
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries,
    () => entries,
  );
  const e = all[d.recordId];
  return e && e.fp === fingerprint(d, wallet) ? e : null;
}

export async function runVerify(
  d: Distribution,
  wallet: string | null,
  admins: string[],
): Promise<VerifyResult> {
  const fp = fingerprint(d, wallet);
  put(d.recordId, { fp, busy: true, result: null });
  let result: VerifyResult;
  try {
    result = await verifyDistribution(d, wallet, admins);
  } catch (e) {
    result = {
      verdict: "error",
      summary: e instanceof Error ? e.message : "Verifikasi gagal.",
      checks: [],
    };
  }
  put(d.recordId, { fp, busy: false, result });
  return result;
}

/** Verifikasi banyak distribusi, maksimal `limit` request paralel (hindari rate limit RPC devnet). */
export async function verifyAll(
  items: { d: Distribution; wallet: string | null }[],
  admins: string[],
  onProgress: (done: number, total: number) => void,
  limit = 3,
) {
  let next = 0;
  let done = 0;
  onProgress(0, items.length);
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++]!;
      await runVerify(it.d, it.wallet, admins);
      onProgress(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

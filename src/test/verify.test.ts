import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeHash } from "@/lib/hash";
import type { Distribution } from "@/lib/types";

// Blockchain tiruan: signature → {memo, signer}
const chain = new Map<string, { memo: string; signer: string; blockTime: number }>();
vi.mock("@/services/blockchainService", () => ({
  getRecordOnChain: async (sig: string) => chain.get(sig) ?? null,
}));
const { verifyDistribution } = await import("@/lib/verify");

const ADMIN = "AdmN7xQ4pLk2Vb9sTr3eYw6HcZu8mFj1oDg5Ea2Kq";
const ADMINS = [ADMIN];
const PENERIMA = "Rcp1Hk8WzN3tLq5Ya7Vb2Xe9Uc4Md6Fg1Js3Po8Tr";
const PENYUSUP = "Evi1Wa11etXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

async function makeDist(over: Partial<Distribution> = {}): Promise<Distribution> {
  const base = {
    recordId: "DIST-0021",
    recipientId: "REC-0001",
    program: "PIP" as const,
    amount: 450000,
    date: "2026-10-01",
    period: "2026 Semester 2",
    salt: "ab".repeat(16),
  };
  const hash = await computeHash(base);
  return { ...base, hash, distSignature: "sigDist", status: "TERCATAT", createdBy: ADMIN, ...over };
}
const dist = (d: Distribution, signer = ADMIN, hash = d.hash) =>
  chain.set(d.distSignature!, {
    memo: `AIDTRACE|v1|DIST|${d.recordId}|${hash}`,
    signer,
    blockTime: 1,
  });
const conf = (d: Distribution, status: string, signer = PENERIMA) =>
  chain.set("sigConf", {
    memo: `AIDTRACE|v1|CONF|${d.recordId}|${d.hash}|${status}`,
    signer,
    blockTime: 2,
  });

beforeEach(() => chain.clear());

describe("verifikasi on-chain", () => {
  it("distribusi sah tanpa konfirmasi → Cocok (konfirmasi dilewati)", async () => {
    const d = await makeDist();
    dist(d);
    const r = await verifyDistribution(d, PENERIMA, ADMINS);
    expect(r.verdict).toBe("cocok");
    expect(r.checks.map((c) => c.state)).toEqual(["ok", "ok", "ok", "skip"]);
  });

  it("distribusi + konfirmasi sah oleh penerima → Cocok", async () => {
    const d = await makeDist({ status: "DIKONFIRMASI_SESUAI", confSignature: "sigConf" });
    dist(d);
    conf(d, "SESUAI");
    const r = await verifyDistribution(d, PENERIMA, ADMINS);
    expect(r.verdict).toBe("cocok");
    expect(r.checks.every((c) => c.state === "ok")).toBe(true);
  });

  it("T5: nominal diubah setelah dicatat → Tidak cocok (Hash)", async () => {
    const d = await makeDist();
    dist(d);
    const r = await verifyDistribution({ ...d, amount: d.amount + 100000 }, PENERIMA, ADMINS);
    expect(r.verdict).toBe("tidak_cocok");
    expect(r.checks.find((c) => c.label === "Hash cocok")?.state).toBe("fail");
  });

  it("T11: memo DIST dari wallet bukan admin → Tidak cocok (Signer)", async () => {
    const d = await makeDist();
    dist(d, PENYUSUP);
    const r = await verifyDistribution(d, PENERIMA, ADMINS);
    expect(r.verdict).toBe("tidak_cocok");
    expect(r.checks.find((c) => c.label === "Signer admin sah")?.state).toBe("fail");
  });

  it("T1: konfirmasi ditandatangani wallet lain → Tidak cocok (Konfirmasi)", async () => {
    const d = await makeDist({ status: "DIKONFIRMASI_SESUAI", confSignature: "sigConf" });
    dist(d);
    conf(d, "SESUAI", ADMIN);
    const r = await verifyDistribution(d, PENERIMA, ADMINS);
    expect(r.verdict).toBe("tidak_cocok");
    expect(r.checks.find((c) => c.label === "Konfirmasi oleh penerima sah")?.state).toBe("fail");
  });

  it("status on-chain berbeda dari status tercatat → Tidak cocok", async () => {
    const d = await makeDist({ status: "DIKONFIRMASI_SESUAI", confSignature: "sigConf" });
    dist(d);
    conf(d, "TIDAK_SESUAI");
    expect((await verifyDistribution(d, PENERIMA, ADMINS)).verdict).toBe("tidak_cocok");
  });

  it("transaksi tidak ada di devnet → Tidak cocok", async () => {
    const d = await makeDist();
    expect((await verifyDistribution(d, PENERIMA, ADMINS)).verdict).toBe("tidak_cocok");
  });

  it("distribusi yang belum dikirim ke devnet → Gagal cek, bukan Cocok", async () => {
    const d = await makeDist({ distSignature: null, status: "MENUNGGU_CHAIN" });
    expect((await verifyDistribution(d, PENERIMA, ADMINS)).verdict).toBe("error");
  });
});

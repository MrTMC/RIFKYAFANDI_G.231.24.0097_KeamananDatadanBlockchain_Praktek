import { describe, expect, it, vi } from "vitest";
import { computeHash } from "@/lib/hash";
import type { AppData, Distribution } from "@/lib/types";
import { bataniLaju } from "@/backend/ai/client";
import { cariCatatan } from "@/backend/ai/pengetahuan";
import {
  BATAS_PER_MENIT,
  cekBuktiOnchain,
  jalankanAgent,
  ringkasanData,
  validasiPertanyaan,
} from "@/backend/ai/groq";

const ADMIN = "AdminWallet1111111111111111111111111111111111";
const REC_W = "RecipWallet1111111111111111111111111111111111";

async function sample(): Promise<{ data: AppData; hash: string; d: Distribution }> {
  const base = {
    recordId: "DIST-0001",
    recipientId: "REC-0001",
    program: "PIP",
    amount: 450000,
    date: "2026-01-01",
    period: "2026-S1",
    salt: "abc",
  };
  const hash = await computeHash(base);
  const d: Distribution = {
    ...base,
    hash,
    distSignature: "sigDist",
    status: "TERCATAT",
    createdBy: ADMIN,
  };
  const data: AppData = {
    session: null,
    admins: [ADMIN],
    programs: [],
    recipients: [
      {
        recipientId: "REC-0001",
        nama: "RAHASIA NAMA",
        jenjang: "SD",
        program: "PIP",
        walletAddress: REC_W,
        aktif: true,
      },
    ],
    distributions: [d],
  };
  return { data, hash, d };
}

/** Data dengan satu distribusi pending, seperti yang hanya dilihat admin. */
async function sampleAdmin() {
  const { data, d } = await sample();
  const pending: Distribution = {
    ...d,
    recordId: "DIST-0002",
    amount: 100000,
    distSignature: null,
    status: "MENUNGGU_CHAIN",
  };
  return { ...data, distributions: [d, pending] } satisfies AppData;
}

const fakeGroq = (create: ReturnType<typeof vi.fn>) =>
  ({ chat: { completions: { create } } }) as never;

describe("cariCatatan", () => {
  it("menemukan catatan relevan dan membuang skor 0", () => {
    expect(cariCatatan("Apa arti status tercatat?")[0]?.id).toBe("AT-07");
    expect(cariCatatan("Siapa presiden pertama Indonesia?")).toEqual([]);
    expect(cariCatatan("Kalau hash berbeda artinya apa?")[0]?.id).toBe("AT-09");
    expect(cariCatatan("Apakah penandatangan harus admin terdaftar?")[0]?.id).toBe("AT-10");
    expect(cariCatatan("Apakah nama penerima masuk blockchain?")[0]?.id).toBe("AT-05");
  });
});

describe("validasiPertanyaan", () => {
  it("menolak pertanyaan kosong / terlalu panjang", () => {
    expect(() => validasiPertanyaan("  ")).toThrow(/maksimal 500/);
    expect(() => validasiPertanyaan("a".repeat(501))).toThrow(/maksimal 500/);
    expect(validasiPertanyaan("  halo  ")).toBe("halo");
  });
});

describe("ringkasanData (hak akses per peran)", () => {
  it("publik: hanya hitungan data publik, tanpa field khusus admin", async () => {
    const { data } = await sample();
    const r = ringkasanData(data, "publik") as Record<string, unknown>;
    expect(r).toMatchObject({ total_distribusi: 1, total_nominal_rp: 450000 });
    expect(r).not.toHaveProperty("penerima_aktif");
    expect(r).not.toHaveProperty("menunggu_transaksi");
    expect(r).not.toHaveProperty("milik_saya");
  });
  it("admin: ada penerima aktif dan jumlah menunggu transaksi", async () => {
    const data = await sampleAdmin();
    const r = ringkasanData(data, "admin") as Record<string, unknown>;
    expect(r).toMatchObject({
      total_distribusi: 2,
      penerima_aktif: 1,
      menunggu_transaksi: 1,
    });
  });
  it("penerima: ada ringkasan milik sendiri saja", async () => {
    const { data } = await sample();
    const r = ringkasanData(data, "penerima", "REC-0001") as Record<string, unknown>;
    expect(r["milik_saya"]).toMatchObject({ jumlah: 1, total_nominal_rp: 450000 });
    const lain = ringkasanData(data, "penerima", "REC-9999") as Record<string, unknown>;
    expect(lain["milik_saya"]).toMatchObject({ jumlah: 0 });
  });
  it("tidak pernah memuat nama atau wallet penerima, untuk peran apa pun", async () => {
    const data = await sampleAdmin();
    for (const peran of ["publik", "penerima", "admin"] as const) {
      const teks = JSON.stringify(ringkasanData(data, peran, "REC-0001"));
      expect(teks).not.toContain("RAHASIA NAMA");
      expect(teks).not.toContain(REC_W);
      expect(teks).not.toContain("REC-0001");
    }
  });
});

describe("cekBuktiOnchain", () => {
  it("semua lolos jika memo, hash, dan signer benar", async () => {
    const { data, hash } = await sample();
    const r = await cekBuktiOnchain("dist-0001", data, async () => ({
      memo: `AIDTRACE|v1|DIST|DIST-0001|${hash}`,
      feePayer: ADMIN,
      signers: [ADMIN],
      failed: false,
      blockTime: 1,
    }));
    expect(r).toMatchObject({ tercatat_di_chain: true, semua_lolos: true });
  });
  it("gagal jika hash di chain berbeda atau signer bukan admin", async () => {
    const { data } = await sample();
    const r = await cekBuktiOnchain("DIST-0001", data, async () => ({
      memo: `AIDTRACE|v1|DIST|DIST-0001|${"0".repeat(64)}`,
      feePayer: "Orang",
      signers: ["Orang"],
      failed: false,
      blockTime: 1,
    }));
    expect(r).toMatchObject({ semua_lolos: false });
  });
  it("record tak dikenal dan format salah", async () => {
    const { data } = await sample();
    expect(await cekBuktiOnchain("DIST-9999", data, async () => null)).toMatchObject({
      ditemukan: false,
    });
    expect(await cekBuktiOnchain("abc", data, async () => null)).toHaveProperty("error");
  });
  it("admin bisa melihat distribusi yang masih menunggu transaksi, publik tidak", async () => {
    const adminData = await sampleAdmin();
    const { data: publikData } = await sample();
    expect(await cekBuktiOnchain("DIST-0002", adminData, async () => null)).toMatchObject({
      ditemukan: true,
      tercatat_di_chain: false,
    });
    expect(await cekBuktiOnchain("DIST-0002", publikData, async () => null)).toMatchObject({
      ditemukan: false,
    });
  });
});

describe("jalankanAgent", () => {
  const toolCall = (name: string, args: string) => ({
    choices: [
      {
        message: {
          content: "",
          tool_calls: [{ id: "1", type: "function", function: { name, arguments: args } }],
        },
      },
    ],
  });

  it("menjalankan tool lalu menjawab, dan menolak record_id berbeda", async () => {
    const { data } = await sample();
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolCall("cek_bukti_onchain", '{"record_id":"DIST-0002"}'))
      .mockResolvedValueOnce({ choices: [{ message: { content: "Selesai." } }] });
    const r = await jalankanAgent(
      { groq: fakeGroq(create), loadData: async () => data, readChain: async () => null },
      { pertanyaan: "Cek dong", recordId: "DIST-0001", peran: "publik" },
    );
    expect(r.jawaban).toBe("Selesai.");
    expect(r.jejak[0]?.output).toMatch(/"error"/);
  });

  it("tool ringkasan_data memakai peran dari server, bukan dari model", async () => {
    const data = await sampleAdmin();
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolCall("ringkasan_data", '{"peran":"admin"}'))
      .mockResolvedValueOnce({ choices: [{ message: { content: "Ada 1 data." } }] });
    const r = await jalankanAgent(
      { groq: fakeGroq(create), loadData: async () => data, readChain: async () => null },
      { pertanyaan: "ada berapa data distribusi", peran: "publik" },
    );
    const out = JSON.parse(r.jejak[0]!.output) as Record<string, unknown>;
    expect(out["peran"]).toBe("publik");
    expect(out).not.toHaveProperty("penerima_aktif");
  });

  it("prompt sistem memuat peran, dan riwayat dibatasi 6 pesan", async () => {
    const { data } = await sample();
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
    const riwayat = Array.from({ length: 10 }, (_, i) => ({
      dari: (i % 2 ? "ai" : "user") as "ai" | "user",
      teks: `pesan ${i}`,
    }));
    await jalankanAgent(
      { groq: fakeGroq(create), loadData: async () => data, readChain: async () => null },
      { pertanyaan: "lanjut", peran: "admin", riwayat },
    );
    const msgs = create.mock.calls[0]![0].messages as { role: string; content: string }[];
    expect(msgs[0]!.content).toContain("admin (sudah login)");
    // 1 system + 6 riwayat + 1 pertanyaan
    expect(msgs).toHaveLength(8);
    expect(msgs[1]!.content).toBe("pesan 4");
  });

  it("berhenti setelah 5 putaran", async () => {
    const { data } = await sample();
    const create = vi
      .fn()
      .mockResolvedValue(toolCall("cari_pengetahuan_lokal", '{"kata_kunci":"status"}'));
    const r = await jalankanAgent(
      { groq: fakeGroq(create), loadData: async () => data, readChain: async () => null },
      { pertanyaan: "Tanya", peran: "publik" },
    );
    expect(create).toHaveBeenCalledTimes(5);
    expect(r.jawaban).toMatch(/terlalu banyak langkah/);
  });
});

describe("bataniLaju", () => {
  it("membatasi 10 permintaan per menit per kunci (default)", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(bataniLaju("ip-x", now)).toBe(true);
    expect(bataniLaju("ip-x", now)).toBe(false);
    expect(bataniLaju("ip-x", now + 61_000)).toBe(true);
  });
  it("batas per peran: publik paling ketat, admin paling longgar", () => {
    expect(BATAS_PER_MENIT.publik).toBeLessThan(BATAS_PER_MENIT.penerima);
    expect(BATAS_PER_MENIT.penerima).toBeLessThan(BATAS_PER_MENIT.admin);
    const now = 2_000_000;
    for (let i = 0; i < BATAS_PER_MENIT.publik; i++)
      expect(bataniLaju("publik:ip", now, BATAS_PER_MENIT.publik)).toBe(true);
    expect(bataniLaju("publik:ip", now, BATAS_PER_MENIT.publik)).toBe(false);
  });
});

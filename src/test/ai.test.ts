import { describe, expect, it, vi } from "vitest";
import { computeHash } from "@/lib/hash";
import type { AppData, Distribution } from "@/lib/types";
import { bataniLaju } from "@/backend/ai/client";
import { cariCatatan } from "@/backend/ai/pengetahuan";
import { cekBuktiOnchain, jalankanAgent, tanyaRag } from "@/backend/ai/groq";

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
      { recipientId: "REC-0001", jenjang: "SD", program: "PIP", walletAddress: REC_W, aktif: true },
    ],
    distributions: [d],
  };
  return { data, hash, d };
}

describe("cariCatatan", () => {
  it("menemukan catatan relevan dan membuang skor 0", () => {
    expect(cariCatatan("Apa arti status tercatat?")[0]?.id).toBe("AT-07");
    expect(cariCatatan("Siapa presiden pertama Indonesia?")).toEqual([]);
    expect(cariCatatan("Kalau hash berbeda artinya apa?")[0]?.id).toBe("AT-09");
    expect(cariCatatan("Apakah penandatangan harus admin terdaftar?")[0]?.id).toBe("AT-10");
    expect(cariCatatan("Apakah nama penerima masuk blockchain?")[0]?.id).toBe("AT-05");
  });
});

describe("tanyaRag", () => {
  it("tidak memanggil Groq jika tidak ada catatan cocok", async () => {
    const create = vi.fn();
    const r = await tanyaRag(
      { chat: { completions: { create } } } as never,
      "Siapa presiden pertama?",
    );
    expect(create).not.toHaveBeenCalled();
    expect(r.sumber).toEqual([]);
  });
  it("menolak pertanyaan kosong / terlalu panjang", async () => {
    await expect(tanyaRag({} as never, "  ")).rejects.toThrow(/maksimal 500/);
    await expect(tanyaRag({} as never, "a".repeat(501))).rejects.toThrow(/maksimal 500/);
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
});

describe("jalankanAgent", () => {
  it("menjalankan tool lalu menjawab, dan menolak record_id berbeda", async () => {
    const { data } = await sample();
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "1",
                  type: "function",
                  function: { name: "cek_bukti_onchain", arguments: '{"record_id":"DIST-0002"}' },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Selesai." } }] });
    const r = await jalankanAgent(
      {
        groq: { chat: { completions: { create } } } as never,
        loadPublic: async () => data,
        readChain: async () => null,
      },
      "Cek dong",
      "DIST-0001",
    );
    expect(r.jawaban).toBe("Selesai.");
    expect(r.jejak[0]?.output).toMatch(/"error"/);
  });
  it("berhenti setelah 5 putaran", async () => {
    const { data } = await sample();
    const loop = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "1",
                type: "function",
                function: { name: "cari_pengetahuan_lokal", arguments: '{"kata_kunci":"status"}' },
              },
            ],
          },
        },
      ],
    };
    const create = vi.fn().mockResolvedValue(loop);
    const r = await jalankanAgent(
      {
        groq: { chat: { completions: { create } } } as never,
        loadPublic: async () => data,
        readChain: async () => null,
      },
      "Tanya",
      undefined,
    );
    expect(create).toHaveBeenCalledTimes(5);
    expect(r.jawaban).toMatch(/terlalu banyak langkah/);
  });
});

describe("bataniLaju", () => {
  it("membatasi 10 permintaan per menit per kunci", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(bataniLaju("ip-x", now)).toBe(true);
    expect(bataniLaju("ip-x", now)).toBe(false);
    expect(bataniLaju("ip-x", now + 61_000)).toBe(true);
  });
});

// @vitest-environment node
// Uji integrasi logika server terhadap Postgres sungguhan.
// Jalan hanya jika TEST_DATABASE_URL diatur, mis.:
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/aidtrace_test npm test
import { readFileSync } from "node:fs";
import bs58 from "bs58";
import postgres from "postgres";
import nacl from "tweetnacl";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildLoginMessage, newNonce } from "@/lib/loginMessage";
import { confMemo, distMemo } from "@/lib/memo";
import type { ChainTx } from "@/backend/solanaRpc";
import { createSessionToken, readSessionToken } from "@/backend/session";
import {
  cancelDistribution,
  createProgram,
  finalizeConfirmation,
  finalizeDistribution,
  loadData,
  prepareDistribution,
  saveRecipient,
  setProgramActive,
  verifyLogin,
  type ChainReader,
} from "@/backend/service";

const URL = process.env["TEST_DATABASE_URL"];
const d = URL ? describe : describe.skip;

const kp = () => {
  const k = nacl.sign.keyPair();
  return { pub: bs58.encode(k.publicKey), secret: k.secretKey };
};
const ADMIN = kp();
const PENERIMA = kp();
const LAIN = kp();
const HOST = "aidtrace.example";

// Blockchain tiruan
const chain = new Map<string, ChainTx>();
const read: ChainReader = async (sig) => chain.get(sig) ?? null;
let n = 0;
const putTx = (memo: string, signer: string, failed = false) => {
  const sig = bs58.encode(nacl.randomBytes(64)) + String(n++).padStart(0, "");
  chain.set(sig, { memo, feePayer: signer, signers: [signer], failed, blockTime: 1 });
  return sig;
};

let sql: ReturnType<typeof postgres>;

d("server: login, peran, distribusi, konfirmasi", () => {
  beforeAll(async () => {
    sql = postgres(URL!, { onnotice: () => {}, max: 2 });
    await sql.unsafe("drop schema public cascade; create schema public;");
    await sql.unsafe(readFileSync("supabase/schema.sql", "utf8"));
    process.env["ADMIN_WALLETS"] = ADMIN.pub;
  });
  afterAll(async () => {
    await sql?.end();
  });
  beforeEach(() => chain.clear());

  const signLogin = (
    who: { pub: string; secret: Uint8Array },
    over: Partial<{ domain: string; issuedAt: string; nonce: string }> = {},
  ) => {
    const message = buildLoginMessage({
      domain: over.domain ?? HOST,
      wallet: who.pub,
      nonce: over.nonce ?? newNonce(),
      issuedAt: over.issuedAt ?? new Date().toISOString(),
    });
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), who.secret),
    );
    return { message, signature };
  };

  it("login sah → wallet; nonce tidak bisa dipakai ulang", async () => {
    const m = signLogin(ADMIN);
    expect(await verifyLogin(sql, m, HOST)).toBe(ADMIN.pub);
    await expect(verifyLogin(sql, m, HOST)).rejects.toThrow(/sudah pernah dipakai/);
  });

  it("login ditolak: domain lain, kedaluwarsa, tanda tangan wallet lain", async () => {
    await expect(
      verifyLogin(sql, signLogin(ADMIN, { domain: "phishing.example" }), HOST),
    ).rejects.toThrow(/domain lain/);
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await expect(verifyLogin(sql, signLogin(ADMIN, { issuedAt: old }), HOST)).rejects.toThrow(
      /kedaluwarsa/,
    );
    const forged = signLogin(ADMIN);
    forged.signature = signLogin(LAIN).signature;
    await expect(verifyLogin(sql, forged, HOST)).rejects.toThrow(/tidak cocok/);
  });

  it("token sesi: sah, dipalsukan, kedaluwarsa", async () => {
    const secret = "x".repeat(40);
    const t = await createSessionToken(ADMIN.pub, Date.now(), secret);
    expect(await readSessionToken(t, Date.now(), secret)).toBe(ADMIN.pub);
    expect(
      await readSessionToken(
        t.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
        Date.now(),
        secret,
      ),
    ).toBeNull();
    expect(await readSessionToken(t, Date.now() + 9 * 3600 * 1000, secret)).toBeNull();
    expect(await readSessionToken(t, Date.now(), "y".repeat(40))).toBeNull();
  });

  it("hanya admin yang bisa menambah penerima; wallet admin & duplikat ditolak (T2)", async () => {
    const base = {
      nama: "Budi",
      jenjang: "SD",
      program: "PIP",
      walletAddress: PENERIMA.pub,
      aktif: true,
    };
    await expect(saveRecipient(sql, LAIN.pub, base)).rejects.toThrow(/khusus Admin/);
    await expect(
      saveRecipient(sql, ADMIN.pub, { ...base, walletAddress: ADMIN.pub }),
    ).rejects.toThrow(/Wallet admin/);
    await expect(
      saveRecipient(sql, ADMIN.pub, { ...base, walletAddress: "bukan-wallet" }),
    ).rejects.toThrow(/tidak valid/);
    expect(await saveRecipient(sql, ADMIN.pub, base)).toBe("REC-0001");
    await expect(saveRecipient(sql, ADMIN.pub, { ...base, nama: "Siti" })).rejects.toThrow(
      /sudah dipakai/,
    );
  });

  it("publik tidak melihat nama; penerima melihat namanya sendiri; admin melihat semua", async () => {
    const pub = await loadData(sql, null);
    expect(pub.session).toBeNull();
    expect(pub.recipients[0]!.nama).toBeUndefined();
    const me = await loadData(sql, PENERIMA.pub);
    expect(me.session?.role).toBe("penerima");
    expect(me.recipients[0]!.nama).toBe("Budi");
    const adm = await loadData(sql, ADMIN.pub);
    expect(adm.session?.role).toBe("admin");
    expect(adm.recipients[0]!.nama).toBe("Budi");
  });

  it("alur distribusi: prepare → transaksi devnet diverifikasi server → tercatat", async () => {
    const input = {
      recipientId: "REC-0001",
      program: "PIP",
      amount: 450000,
      date: "2026-10-20",
      period: "2026 Semester 2",
    };
    await expect(prepareDistribution(sql, PENERIMA.pub, input)).rejects.toThrow(/khusus Admin/);
    const { recordId, hash } = await prepareDistribution(sql, ADMIN.pub, input);
    expect(recordId).toBe("DIST-0001");

    // menunggu chain: tidak terlihat publik, terlihat admin
    expect((await loadData(sql, null)).distributions).toHaveLength(0);
    expect((await loadData(sql, ADMIN.pub)).distributions[0]!.status).toBe("MENUNGGU_CHAIN");

    // T11: memo benar tetapi ditandatangani wallet bukan admin
    const fake = putTx(distMemo(recordId, hash), LAIN.pub);
    await expect(
      finalizeDistribution(sql, ADMIN.pub, { recordId, signature: fake }, read),
    ).rejects.toThrow(/tidak ditandatangani/);
    // memo dengan hash lain
    const wrong = putTx(distMemo(recordId, "0".repeat(64)), ADMIN.pub);
    await expect(
      finalizeDistribution(sql, ADMIN.pub, { recordId, signature: wrong }, read),
    ).rejects.toThrow(/tidak sesuai/);
    // transaksi gagal di chain
    const failed = putTx(distMemo(recordId, hash), ADMIN.pub, true);
    await expect(
      finalizeDistribution(sql, ADMIN.pub, { recordId, signature: failed }, read),
    ).rejects.toThrow(/gagal/);
    // transaksi tidak ditemukan
    await expect(
      finalizeDistribution(sql, ADMIN.pub, { recordId, signature: "1".repeat(88) }, read),
    ).rejects.toThrow(/belum ditemukan/);

    const ok = putTx(distMemo(recordId, hash), ADMIN.pub);
    await finalizeDistribution(sql, ADMIN.pub, { recordId, signature: ok }, read);
    const pub = await loadData(sql, null);
    expect(pub.distributions[0]).toMatchObject({ recordId, status: "TERCATAT", distSignature: ok });
    await expect(
      finalizeDistribution(sql, ADMIN.pub, { recordId, signature: ok }, read),
    ).rejects.toThrow(/sudah tercatat/);
  });

  it("konfirmasi: hanya penerima pemilik; T1 wallet admin ditolak; status tersimpan", async () => {
    const recordId = "DIST-0001";
    const [row] = await sql<
      { hash: string }[]
    >`select hash from distributions where record_id = ${recordId}`;
    const hash = row!.hash;
    const sigAdmin = putTx(confMemo(recordId, hash!, "SESUAI"), ADMIN.pub);
    await expect(
      finalizeConfirmation(
        sql,
        ADMIN.pub,
        { recordId, status: "SESUAI", actualAmount: 0, signature: sigAdmin },
        read,
      ),
    ).rejects.toThrow(/khusus Penerima/);
    const sigLain = putTx(confMemo(recordId, hash!, "SESUAI"), LAIN.pub);
    await expect(
      finalizeConfirmation(
        sql,
        PENERIMA.pub,
        { recordId, status: "SESUAI", actualAmount: 0, signature: sigLain },
        read,
      ),
    ).rejects.toThrow(/tidak ditandatangani/);
    await expect(
      finalizeConfirmation(
        sql,
        PENERIMA.pub,
        { recordId, status: "TIDAK_SESUAI", actualAmount: 450000, signature: sigLain },
        read,
      ),
    ).rejects.toThrow(/pilih "Sesuai"/);

    const sig = putTx(confMemo(recordId, hash!, "TIDAK_SESUAI"), PENERIMA.pub);
    await finalizeConfirmation(
      sql,
      PENERIMA.pub,
      { recordId, status: "TIDAK_SESUAI", actualAmount: 300000, signature: sig },
      read,
    );
    const pub = await loadData(sql, null);
    expect(pub.distributions[0]).toMatchObject({
      status: "DIKONFIRMASI_TIDAK_SESUAI",
      actualAmount: 300000,
      confSignature: sig,
    });
  });

  it("batal hanya untuk distribusi yang belum tercatat; jejak audit tersimpan", async () => {
    const { recordId } = await prepareDistribution(sql, ADMIN.pub, {
      recipientId: "REC-0001",
      program: "PIP",
      amount: 100000,
      date: "2026-10-21",
      period: "P",
    });
    await cancelDistribution(sql, ADMIN.pub, recordId);
    await expect(cancelDistribution(sql, ADMIN.pub, "DIST-0001")).rejects.toThrow(/belum tercatat/);
    const logs = await sql<{ action: string }[]>`select action from audit_log order by id`;
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        "login",
        "recipient.create",
        "distribution.prepare",
        "distribution.record",
        "distribution.confirm",
        "distribution.cancel",
      ]),
    );
  });

  it("program: admin menambah & menonaktifkan; nonaktif tidak bisa dipakai data baru", async () => {
    expect((await loadData(sql, null)).programs.map((p) => p.name)).toEqual([
      "PIP",
      "KIP Kuliah",
      "Beasiswa Daerah",
    ]);
    await expect(createProgram(sql, PENERIMA.pub, "Beasiswa Prestasi")).rejects.toThrow(
      /khusus Admin/,
    );
    await expect(createProgram(sql, ADMIN.pub, "x")).rejects.toThrow(/2–40 karakter/);
    await expect(createProgram(sql, ADMIN.pub, "A|B memo")).rejects.toThrow(/2–40 karakter/);
    expect(await createProgram(sql, ADMIN.pub, "  Beasiswa   Prestasi ")).toBe("Beasiswa Prestasi");
    await expect(createProgram(sql, ADMIN.pub, "beasiswa prestasi")).rejects.toThrow(/sudah ada/);

    // REC-0001 terdaftar dengan program PIP → distribusi WAJIB ber-program PIP.
    const dist = {
      recipientId: "REC-0001",
      program: "PIP",
      amount: 750000,
      date: "2026-10-22",
      period: "2026",
    };
    await expect(
      prepareDistribution(sql, ADMIN.pub, { ...dist, program: "Beasiswa Prestasi" }),
    ).rejects.toThrow(/sesuai data penerima \(REC-0001: PIP\)/);
    await expect(
      prepareDistribution(sql, ADMIN.pub, { ...dist, program: "Tidak Ada" }),
    ).rejects.toThrow(/sesuai data penerima/);
    const { recordId } = await prepareDistribution(sql, ADMIN.pub, dist);
    await cancelDistribution(sql, ADMIN.pub, recordId);

    // PIP dinonaktifkan: distribusi baru untuk penerima PIP ditolak, penerima lama ber-program
    // PIP tetap bisa diubah datanya, tetapi penerima baru tidak bisa memakai PIP.
    await expect(setProgramActive(sql, PENERIMA.pub, "PIP", false)).rejects.toThrow(/khusus Admin/);
    await setProgramActive(sql, ADMIN.pub, "PIP", false);
    await expect(prepareDistribution(sql, ADMIN.pub, dist)).rejects.toThrow(/nonaktif/);
    expect(
      await saveRecipient(sql, ADMIN.pub, {
        recipientId: "REC-0001",
        nama: "Budi S.",
        jenjang: "SD",
        program: "PIP",
        walletAddress: PENERIMA.pub,
        aktif: true,
      }),
    ).toBe("REC-0001");
    await expect(
      saveRecipient(sql, ADMIN.pub, {
        nama: "Ani",
        jenjang: "SMP",
        program: "PIP",
        walletAddress: LAIN.pub,
        aktif: true,
      }),
    ).rejects.toThrow(/nonaktif/);
    await setProgramActive(sql, ADMIN.pub, "PIP", true);

    // Program yang sudah dipakai tidak bisa dihapus / diganti nama (dijaga database).
    await expect(sql`delete from programs where name = 'PIP'`).rejects.toThrow(/foreign key/);
    await expect(sql`update programs set name = 'PIP2' where name = 'PIP'`).rejects.toThrow(
      /foreign key/,
    );
    const logs = await sql<{ action: string }[]>`select action from audit_log`;
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(["program.create", "program.deactivate", "program.activate"]),
    );
  });

  it("migrasi: database versi lama (CHECK 3 program) bisa diperbarui dengan schema.sql", async () => {
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const check = "check (program in ('PIP','KIP Kuliah','Beasiswa Daerah'))";
    const old = schema
      .replace(/create table if not exists programs[\s\S]*?on conflict do nothing;/, "")
      .replaceAll("references programs(name) on update restrict on delete restrict", check)
      .replace(/-- Migrasi untuk database[\s\S]*?end \$\$;/, "")
      .replace("alter table programs      enable row level security;", "")
      .replace("admins, programs, recipients", "admins, recipients");
    expect(old).not.toContain("programs");
    await sql.unsafe("drop schema public cascade; create schema public;");
    await sql.unsafe(old);
    await sql`insert into recipients (recipient_id, nama, jenjang, program, wallet)
              values ('REC-0001', 'Lama', 'SD', 'KIP Kuliah', ${PENERIMA.pub})`;
    await sql.unsafe(schema);
    await sql.unsafe(schema); // aman dijalankan ulang
    const cons = await sql<{ conname: string }[]>`
      select conname from pg_constraint where conname like '%program%' order by conname`;
    expect(cons.map((c) => c.conname)).toEqual(
      expect.arrayContaining(["distributions_program_fkey", "recipients_program_fkey"]),
    );
    expect(cons.map((c) => c.conname)).not.toContain("recipients_program_check");
    expect(await createProgram(sql, ADMIN.pub, "Bantuan Yayasan")).toBe("Bantuan Yayasan");
    await sql`update recipients set program = 'Bantuan Yayasan' where recipient_id = 'REC-0001'`;
    await expect(
      sql`update recipients set program = 'Asal' where recipient_id = 'REC-0001'`,
    ).rejects.toThrow(/foreign key/);
  });
});

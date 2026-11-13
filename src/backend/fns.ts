// Server functions yang dipanggil dari browser. Isi handler hanya berjalan di
// server; browser hanya menerima stub RPC (tanpa kode database / rahasia).
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import type { AppData, Role } from "@/lib/types";

const COOKIE_OPTS = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
});

async function ctx() {
  const [{ db }, session, env, service, rpc] = await Promise.all([
    import("./db"),
    import("./session"),
    import("./env"),
    import("./service"),
    import("./solanaRpc"),
  ]);
  const wallet = await session.readSessionToken(getCookie(session.SESSION_COOKIE));
  return {
    sql: db(),
    wallet,
    session,
    env,
    service,
    readChain: (sig: string) => rpc.getChainTx(sig),
  };
}

/** Ubah error menjadi pesan yang aman untuk pengguna. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const { UserError } = await import("./service");
    if (e instanceof UserError) throw new Error(e.message);
    if (e instanceof z.ZodError) throw new Error("Data yang dikirim tidak valid.");
    console.error("[AidTrace] server error:", e);
    throw new Error("Terjadi kesalahan di server. Coba lagi beberapa saat.");
  }
}

const sigSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
const recordIdSchema = z.string().regex(/^DIST-\d{4,}$/);

// ------------------------------------------------------------------ data & sesi

export const loadAppData = createServerFn({ method: "GET" }).handler((): Promise<AppData> =>
  run(async () => {
    const c = await ctx();
    return c.service.loadData(c.sql, c.wallet);
  }),
);

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ message: z.string().max(1000), signature: z.string().max(200) }).parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      // Jangan percaya x-forwarded-host (bisa dipalsukan); pakai APP_DOMAIN atau Host.
      const domains = c.env.allowedLoginDomains(getRequestHeader("host"));
      const wallet = await c.service.verifyLogin(c.sql, data, domains);
      setCookie(c.session.SESSION_COOKIE, await c.session.createSessionToken(wallet), {
        ...COOKIE_OPTS(c.env.isProduction()),
        maxAge: c.session.SESSION_TTL_SECONDS,
      });
      return { ok: true as const };
    }),
  );

export const logout = createServerFn({ method: "POST" }).handler(() =>
  run(async () => {
    const { SESSION_COOKIE } = await import("./session");
    const { isProduction } = await import("./env");
    deleteCookie(SESSION_COOKIE, COOKIE_OPTS(isProduction()));
    return { ok: true as const };
  }),
);

// ------------------------------------------------------------------ admin

export const createProgramFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().max(60) }).parse(d))
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      return { name: await c.service.createProgram(c.sql, c.wallet, data.name) };
    }),
  );

export const setProgramActiveFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().max(60), aktif: z.boolean() }).parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      await c.service.setProgramActive(c.sql, c.wallet, data.name, data.aktif);
      return { ok: true as const };
    }),
  );

export const saveRecipientFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recipientId: z
          .string()
          .regex(/^REC-\d{4,}$/)
          .optional(),
        nama: z.string().max(100),
        jenjang: z.string().max(20),
        program: z.string().max(40),
        walletAddress: z.string().max(64),
        aktif: z.boolean(),
      })
      .parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      return { recipientId: await c.service.saveRecipient(c.sql, c.wallet, data) };
    }),
  );

export const prepareDistributionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recipientId: z.string().regex(/^REC-\d{4,}$/),
        program: z.string().max(40),
        amount: z.number(),
        date: z.string().max(10),
        period: z.string().max(40),
      })
      .parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      return c.service.prepareDistribution(c.sql, c.wallet, data);
    }),
  );

export const finalizeDistributionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recordId: recordIdSchema, signature: sigSchema }).parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      await c.service.finalizeDistribution(c.sql, c.wallet, data, c.readChain);
      return { ok: true as const };
    }),
  );

export const cancelDistributionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recordId: recordIdSchema }).parse(d))
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      await c.service.cancelDistribution(c.sql, c.wallet, data.recordId);
      return { ok: true as const };
    }),
  );

// ------------------------------------------------------------------ AI (Groq)
// Bisa dipakai siapa saja (login atau tidak), tapi dibatasi:
//  - peran (publik / penerima / admin) dibaca SERVER dari cookie sesi, bukan dari kiriman browser;
//  - data yang boleh dilihat AI mengikuti peran (service.loadData sudah membatasi);
//  - batas permintaan per IP, lalu per peran (publik paling ketat);
//  - panjang pertanyaan dan riwayat divalidasi.

const aiInput = z.object({
  pertanyaan: z.string().max(2000),
  recordId: z.string().max(20).optional(),
  riwayat: z
    .array(z.object({ dari: z.enum(["user", "ai"]), teks: z.string().max(600) }))
    .max(6)
    .optional(),
});

async function aiCtx() {
  const [ai, env, client, service] = await Promise.all([
    import("./ai/groq"),
    import("./env"),
    import("./ai/client"),
    import("./service"),
  ]);
  const tooMany = () =>
    new service.UserError("Terlalu banyak permintaan AI. Tunggu semenit lalu coba lagi.");
  const ip = (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() || "lokal";
  if (!client.bataniLaju(`ip:${ip}`, Date.now(), 30)) throw tooMany();

  // Peran dari sesi di server. Kalau database tidak bisa dijangkau, anggap publik.
  let c: Awaited<ReturnType<typeof ctx>> | null = null;
  let peran: Role = "publik";
  let recipientId: string | null = null;
  try {
    c = await ctx();
    const sesi = await c.service.resolveSession(c.sql, c.wallet);
    if (sesi) {
      peran = sesi.role;
      recipientId = sesi.recipientId;
    }
  } catch (e) {
    console.error("[AidTrace][AI] gagal membaca sesi:", e);
  }
  const kunci = `${peran}:${c?.wallet ?? ip}`;
  if (!client.bataniLaju(kunci, Date.now(), ai.BATAS_PER_MENIT[peran])) throw tooMany();

  const loadData = async () => {
    if (!c) throw new Error("Database tidak tersedia.");
    return c.service.loadData(c.sql, c.wallet);
  };
  return { ai, groq: client.buatGroq(env.groqApiKey()), peran, recipientId, loadData };
}

async function runAi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const { terjemahkanErrorGroq } = await import("./ai/groq");
    throw new Error(terjemahkanErrorGroq(e).message);
  }
}

export const agentAiFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => aiInput.parse(d))
  .handler(({ data }) =>
    runAi(async () => {
      const { ai, groq, peran, recipientId, loadData } = await aiCtx();
      return ai.jalankanAgent(
        {
          groq,
          loadData,
          readChain: async (sig) => (await import("./solanaRpc")).getChainTx(sig),
        },
        {
          pertanyaan: data.pertanyaan,
          recordId: data.recordId,
          riwayat: data.riwayat,
          peran,
          recipientId,
        },
      );
    }),
  );

// ------------------------------------------------------------------ penerima

export const finalizeConfirmationFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recordId: recordIdSchema,
        status: z.enum(["SESUAI", "TIDAK_SESUAI"]),
        actualAmount: z.number(),
        signature: sigSchema,
      })
      .parse(d),
  )
  .handler(({ data }) =>
    run(async () => {
      const c = await ctx();
      await c.service.finalizeConfirmation(c.sql, c.wallet, data, c.readChain);
      return { ok: true as const };
    }),
  );

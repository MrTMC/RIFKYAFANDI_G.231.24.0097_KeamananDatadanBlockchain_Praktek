// Server functions yang dipanggil dari browser. Isi handler hanya berjalan di
// server; browser hanya menerima stub RPC (tanpa kode database / rahasia).
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import type { AppData } from "@/lib/types";

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

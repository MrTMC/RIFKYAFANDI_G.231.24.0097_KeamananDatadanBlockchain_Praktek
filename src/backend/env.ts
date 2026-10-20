// Konfigurasi server. HANYA dibaca di server — jangan import dari kode browser.
//
// Environment variable yang dipakai:
//   DATABASE_URL     (wajib)  connection string Postgres/Supabase (pooler, port 6543)
//   SESSION_SECRET   (wajib di produksi) string acak ≥ 32 karakter untuk menandatangani cookie sesi
//   ADMIN_WALLETS    (opsional) alamat wallet admin awal, dipisah koma
//   SOLANA_RPC_URL   (opsional) default https://api.devnet.solana.com
//   APP_DOMAIN       (disarankan di produksi) domain web, mis. aidtrace-receipt.vercel.app
//                    — pesan login hanya diterima jika dibuat untuk domain ini

const env = (k: string): string | undefined => {
  const v = typeof process !== "undefined" ? process.env[k] : undefined;
  return v && v.trim() ? v.trim() : undefined;
};

export function databaseUrl(): string {
  const v = env("DATABASE_URL");
  if (!v) throw new Error("DATABASE_URL belum diatur di environment server.");
  return v;
}

let devSecret: string | null = null;
export function sessionSecret(): string {
  const v = env("SESSION_SECRET");
  if (v) {
    if (v.length < 32) throw new Error("SESSION_SECRET minimal 32 karakter.");
    return v;
  }
  if (env("NODE_ENV") === "production" || env("VERCEL")) {
    throw new Error("SESSION_SECRET belum diatur di environment server.");
  }
  // Mode pengembangan lokal: rahasia acak per proses (sesi hilang saat server restart).
  if (!devSecret) {
    devSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    console.warn("[AidTrace] SESSION_SECRET tidak diatur — memakai rahasia sementara (mode dev).");
  }
  return devSecret;
}

export function envAdminWallets(): string[] {
  return (env("ADMIN_WALLETS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function solanaRpcUrl(): string {
  return env("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com";
}

/** Domain yang sah untuk pesan login. Header `host` hanya dipakai jika APP_DOMAIN kosong. */
export function allowedLoginDomains(hostHeader: string | undefined): string[] {
  const configured = (env("APP_DOMAIN") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  return hostHeader ? [hostHeader] : [];
}

export const isProduction = () => env("NODE_ENV") === "production" || !!env("VERCEL");

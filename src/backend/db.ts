// Koneksi Postgres (Supabase). HANYA dipakai di server.
import postgres from "postgres";
import { databaseUrl } from "./env";

export type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

export function db(): Sql {
  if (!client) {
    const url = databaseUrl();
    const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
    client = postgres(url, {
      ssl: local ? false : "require", // Supabase: koneksi terenkripsi
      max: 3, // serverless: sedikit koneksi per instance
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false, // wajib untuk pooler Supabase (transaction mode, port 6543)
      onnotice: () => {},
    });
  }
  return client;
}

/** Hanya untuk test: pakai koneksi tertentu. */
export function setDbForTests(sql: Sql | null) {
  client = sql;
}

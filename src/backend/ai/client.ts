// Pembuat klien Groq + pembatas laju sederhana (di memori, per proses server).
import Groq from "groq-sdk";

export function buatGroq(apiKey: string) {
  return new Groq({ apiKey });
}

const WINDOW_MS = 60_000;
const MAKS_PER_MENIT = 10;
const hits = new Map<string, number[]>();

/** true jika permintaan masih boleh diproses (maks 10/menit per IP). */
export function bataniLaju(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAKS_PER_MENIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000)
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return true;
}

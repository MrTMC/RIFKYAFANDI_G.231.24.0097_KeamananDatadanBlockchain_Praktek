// Token sesi: base64url(JSON {w, exp}) + "." + HMAC-SHA256. Disimpan di cookie httpOnly.
// Tidak ada data sensitif di dalamnya; peran selalu dibaca ulang dari database.
import { sessionSecret } from "./env";

export const SESSION_COOKIE = "aidtrace_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 jam

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i]! ^ b[i]!;
  return r === 0;
}

export async function createSessionToken(
  wallet: string,
  now = Date.now(),
  secret = sessionSecret(),
) {
  const payload = b64url(
    enc.encode(JSON.stringify({ w: wallet, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })),
  );
  return `${payload}.${b64url(await hmac(payload, secret))}`;
}

/** Mengembalikan wallet jika token sah & belum kedaluwarsa, selain itu null. */
export async function readSessionToken(
  token: string | undefined,
  now = Date.now(),
  secret = sessionSecret(),
) {
  if (!token || token.length > 1024) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!timingSafeEqual(fromB64url(sig), await hmac(payload, secret))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {
      w?: unknown;
      exp?: unknown;
    };
    if (typeof data.w !== "string" || typeof data.exp !== "number") return null;
    if (data.exp * 1000 < now) return null;
    return data.w;
  } catch {
    return null;
  }
}

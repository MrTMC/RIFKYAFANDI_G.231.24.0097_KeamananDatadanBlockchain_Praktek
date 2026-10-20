// Format pesan login "Sign-In With Solana" sederhana. Dipakai bersama oleh
// browser (yang meminta Phantom menandatangani) dan server (yang memverifikasi).

export type LoginFields = { domain: string; wallet: string; nonce: string; issuedAt: string };

const HEADER = "AidTrace Receipt — masuk dengan wallet";
const FOOTER = "Pesan ini hanya untuk login dan tidak memindahkan dana.";

export function buildLoginMessage(f: LoginFields): string {
  return [
    HEADER,
    `Domain: ${f.domain}`,
    `Wallet: ${f.wallet}`,
    `Nonce: ${f.nonce}`,
    `Waktu: ${f.issuedAt}`,
    FOOTER,
  ].join("\n");
}

const RE = new RegExp(
  "^" +
    HEADER +
    "\\nDomain: ([^\\n]{1,253})" +
    "\\nWallet: ([1-9A-HJ-NP-Za-km-z]{32,44})" +
    "\\nNonce: ([0-9a-f]{32})" +
    "\\nWaktu: (\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z)" +
    "\\n" +
    FOOTER +
    "$",
);

export function parseLoginMessage(message: string): LoginFields | null {
  const m = RE.exec(message);
  if (!m) return null;
  return { domain: m[1]!, wallet: m[2]!, nonce: m[3]!, issuedAt: m[4]! };
}

export function newNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

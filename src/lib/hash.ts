export type HashInput = {
  amount: number;
  date: string;
  period: string;
  program: string;
  recipientId: string;
  recordId: string;
  salt: string;
};

export function generateSalt(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// JSON kanonik: key diurutkan. Nama penerima tidak pernah menjadi input.
export function canonicalJson(i: HashInput): string {
  const src: Record<string, unknown> = {
    amount: i.amount,
    date: i.date,
    period: i.period,
    program: i.program,
    recipientId: i.recipientId,
    recordId: i.recordId,
    salt: i.salt,
  };
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) sorted[k] = src[k];
  return JSON.stringify(sorted);
}

export async function computeHash(i: HashInput): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(i)));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
}

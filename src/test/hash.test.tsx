import { describe, expect, it } from "vitest";
import { canonicalJson, computeHash, generateSalt } from "@/lib/hash";

const base = {
  amount: 450000,
  date: "2026-02-10",
  period: "2026 Semester 1",
  program: "PIP",
  recipientId: "REC-0001",
  recordId: "DIST-0001",
  salt: "00".repeat(16),
};

describe("hash", () => {
  it("canonical JSON has sorted keys and no name", () => {
    const s = canonicalJson({ ...base, namaDummy: "Budi" } as typeof base);
    expect(Object.keys(JSON.parse(s))).toEqual([
      "amount",
      "date",
      "period",
      "program",
      "recipientId",
      "recordId",
      "salt",
    ]);
  });
  it("salt is 16 bytes hex", () => expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/));
  it("changed amount gives different hash", async () => {
    expect(await computeHash(base)).not.toBe(await computeHash({ ...base, amount: 550000 }));
  });
});

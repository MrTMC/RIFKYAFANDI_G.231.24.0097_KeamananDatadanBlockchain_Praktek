// @vitest-environment node
import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { parseChainTx } from "@/backend/solanaRpc";

const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const CB = "ComputeBudget111111111111111111111111111111";
const ADMIN = "AdmN7xQ4pLk2Vb9sTr3eYw6HcZu8mFj1oDg5Ea2Kq";
const ours = `AIDTRACE|v1|DIST|DIST-0001|${"a".repeat(64)}`;

const tx = (
  instructions: Array<{ programId: string } & Record<string, unknown>>,
  logMessages: string[] = [],
) => ({
  blockTime: 1,
  meta: { err: null, logMessages },
  transaction: {
    message: {
      accountKeys: [
        { pubkey: ADMIN, signer: true },
        { pubkey: MEMO, signer: false },
      ],
      instructions,
    },
  },
});

describe("parseChainTx (format respons RPC devnet)", () => {
  it("memo ter-parse sebagai string", () => {
    expect(parseChainTx(tx([{ programId: MEMO, program: "spl-memo", parsed: ours }]))?.memo).toBe(
      ours,
    );
  });

  it("Phantom menambah instruksi ComputeBudget → tetap terbaca", () => {
    const r = parseChainTx(
      tx([
        { programId: CB, data: "3DTZbgwsozUF", accounts: [] },
        { programId: CB, data: "LKoyXd", accounts: [] },
        { programId: MEMO, program: "spl-memo", parsed: ours },
      ]),
    );
    expect(r?.memo).toBe(ours);
    expect(r?.feePayer).toBe(ADMIN);
  });

  it("memo tidak ter-parse (format lain) → diambil dari log program", () => {
    const r = parseChainTx(
      tx(
        [{ programId: MEMO, data: "xyz", accounts: [ADMIN] }],
        [
          `Program ${MEMO} invoke [1]`,
          `Program log: Memo (len ${ours.length}): "${ours}"`,
          `Program ${MEMO} success`,
        ],
      ),
    );
    expect(r?.memo).toBe(ours);
  });

  it("ada memo lain selain AIDTRACE → memo AIDTRACE yang dipilih", () => {
    const r = parseChainTx(
      tx([
        { programId: MEMO, program: "spl-memo", parsed: "memo dari wallet" },
        { programId: MEMO, program: "spl-memo", parsed: ours },
      ]),
    );
    expect(r?.memo).toBe(ours);
  });

  it("dua memo AIDTRACE berbeda → ditolak (ambigu)", () => {
    const other = ours.replace("DIST-0001", "DIST-0002");
    const r = parseChainTx(
      tx([
        { programId: MEMO, program: "spl-memo", parsed: ours },
        { programId: MEMO, program: "spl-memo", parsed: other },
      ]),
    );
    expect(r?.memo).toBe("");
  });

  it("Memo v4 (Memo4c2p…) tidak di-parse RPC & log berbeda → didekode dari data", () => {
    const V4 = "Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH";
    const data = bs58.encode(new TextEncoder().encode(ours));
    const r = parseChainTx(
      tx(
        [{ programId: V4, data, accounts: [ADMIN], stackHeight: null }],
        [
          `Program ${V4} invoke [1]`,
          `Program ${V4} consumed 813 of 200000 compute units`,
          `Program ${V4} success`,
        ],
      ),
    );
    expect(r?.memo).toBe(ours);
  });

  it("program bukan memo dengan data mirip → diabaikan", () => {
    const data = bs58.encode(new TextEncoder().encode(ours));
    expect(parseChainTx(tx([{ programId: CB, data, accounts: [] }]))?.memo).toBe("");
  });
});

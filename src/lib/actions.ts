// Alur gabungan browser ↔ devnet ↔ server.
import {
  cancelDistributionFn,
  createProgramFn,
  finalizeConfirmationFn,
  finalizeDistributionFn,
  prepareDistributionFn,
  saveRecipientFn,
  setProgramActiveFn,
} from "@/backend/fns";
import type { ConfStatus } from "@/lib/memo";
import { refreshData } from "@/lib/store";
import type { DistributionDraft, RecipientDraft } from "@/lib/types";
import { confirmReceipt, recordDistribution } from "@/services/blockchainService";

/** Error yang membawa signature transaksi yang sudah terkirim (untuk coba verifikasi ulang). */
export class PendingVerificationError extends Error {
  constructor(
    message: string,
    public signature: string,
  ) {
    super(message);
  }
}

export async function createProgram(name: string) {
  const res = await createProgramFn({ data: { name } });
  await refreshData();
  return res.name;
}

export async function setProgramActive(name: string, aktif: boolean) {
  await setProgramActiveFn({ data: { name, aktif } });
  await refreshData();
}

export async function saveRecipient(r: RecipientDraft) {
  const res = await saveRecipientFn({ data: r });
  await refreshData();
  return res.recipientId;
}

/** 1) server menyiapkan record + hash, 2) admin menandatangani memo di Phantom, 3) server memverifikasi. */
export async function recordNewDistribution(d: DistributionDraft) {
  const { recordId, hash } = await prepareDistributionFn({ data: d });
  await refreshData();
  const signature = await sendDistributionTx(recordId, hash);
  return { recordId, hash, signature };
}

/** Kirim (ulang) transaksi DIST untuk distribusi yang sudah disiapkan, lalu minta server memverifikasi. */
export async function sendDistributionTx(recordId: string, hash: string) {
  const { signature } = await recordDistribution(recordId, hash);
  await finalizeDistribution(recordId, signature);
  return signature;
}

export async function finalizeDistribution(recordId: string, signature: string) {
  try {
    await finalizeDistributionFn({ data: { recordId, signature } });
  } catch (e) {
    throw new PendingVerificationError(
      e instanceof Error ? e.message : "Verifikasi server gagal.",
      signature,
    );
  } finally {
    await refreshData();
  }
}

export async function cancelDistribution(recordId: string) {
  await cancelDistributionFn({ data: { recordId } });
  await refreshData();
}

export async function confirmDistribution(input: {
  recordId: string;
  hash: string;
  status: ConfStatus;
  actualAmount: number;
}) {
  const { signature } = await confirmReceipt(input.recordId, input.hash, input.status);
  await finalizeConfirmation({ ...input, signature });
  return signature;
}

export async function finalizeConfirmation(input: {
  recordId: string;
  status: ConfStatus;
  actualAmount: number;
  signature: string;
}) {
  try {
    await finalizeConfirmationFn({
      data: {
        recordId: input.recordId,
        status: input.status,
        actualAmount: input.actualAmount,
        signature: input.signature,
      },
    });
  } catch (e) {
    throw new PendingVerificationError(
      e instanceof Error ? e.message : "Verifikasi server gagal.",
      input.signature,
    );
  } finally {
    await refreshData();
  }
}

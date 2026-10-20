// Data aplikasi di browser = salinan dari server (database). Tidak ada lagi
// localStorage: semua pengguna, di perangkat mana pun, melihat data yang sama.
import { useSyncExternalStore } from "react";
import { loadAppData } from "@/backend/fns";
import type { AppData, Status } from "@/lib/types";

export * from "@/lib/types";

let state: AppData | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let inflight: Promise<void> | null = null;

/** Ambil ulang data dari server (dipanggil setelah login/logout/perubahan data). */
export function refreshData(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      state = await loadAppData();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Gagal memuat data dari server.";
    } finally {
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

let started = false;
export function initStore() {
  if (started) return;
  started = true;
  void refreshData();
}

export function useStore(): AppData | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
}
export function useStoreError(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => error,
    () => null,
  );
}

export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export const STATUS_LABEL: Record<Status, string> = {
  MENUNGGU_CHAIN: "Menunggu transaksi",
  TERCATAT: "Tercatat",
  DIKONFIRMASI_SESUAI: "Dikonfirmasi sesuai",
  DIKONFIRMASI_TIDAK_SESUAI: "Dilaporkan tidak sesuai",
};

// Jembatan antara wallet-adapter (React context, client-only) dan kode non-React
// seperti blockchainService. Tidak meng-import web3.js agar aman untuk SSR.
import { useSyncExternalStore } from "react";
import type { Connection, Transaction } from "@solana/web3.js";

export type BridgeState = {
  ready: boolean; // provider wallet sudah dimuat di browser
  publicKey: string | null;
  balanceLamports: number | null;
  sendTransaction: ((tx: Transaction, c: Connection) => Promise<string>) | null;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  disconnect: (() => Promise<void>) | null;
  /** false = ekstensi Phantom tidak terdeteksi di browser ini. */
  phantomDetected: boolean | null;
};

let state: BridgeState = {
  ready: false,
  publicKey: null,
  balanceLamports: null,
  sendTransaction: null,
  signMessage: null,
  disconnect: null,
  phantomDetected: null,
};
const SERVER: BridgeState = state;
const listeners = new Set<() => void>();

export function setBridge(patch: Partial<BridgeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const getBridge = () => state;
export function useBridge() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => SERVER,
  );
}

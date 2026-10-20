// Polyfill Buffer untuk web3.js di browser (TanStack Start tidak punya main.tsx;
// modul ini di-import lebih dulu oleh provider wallet dan blockchainService).
// "buffer" diarahkan ke paket npm `buffer` lewat alias di vite.config.ts.
import { Buffer } from "buffer";

if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

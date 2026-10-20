// Peran pengguna = sesi server (login dengan tanda tangan wallet), bukan
// sekadar wallet yang terhubung. Peran dibaca dari database oleh server.
import bs58 from "bs58";
import { login, logout } from "@/backend/fns";
import { buildLoginMessage, newNonce } from "@/lib/loginMessage";
import { translateError } from "@/lib/memo";
import { getBridge, useBridge } from "@/lib/solanaBridge";
import { refreshData, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

export type { Role };

/** Minta Phantom menandatangani pesan login, lalu server membuat sesi. */
export async function signIn(): Promise<void> {
  const b = getBridge();
  if (!b.publicKey) throw new Error("Hubungkan wallet Phantom terlebih dahulu.");
  if (!b.signMessage) throw new Error("Wallet ini tidak mendukung tanda tangan pesan.");
  const message = buildLoginMessage({
    domain: window.location.host,
    wallet: b.publicKey,
    nonce: newNonce(),
    issuedAt: new Date().toISOString(),
  });
  let signature: Uint8Array;
  try {
    signature = await b.signMessage(new TextEncoder().encode(message));
  } catch (e) {
    throw new Error(translateError(e));
  }
  await login({ data: { message, signature: bs58.encode(signature) } });
  await refreshData();
}

export async function signOut(): Promise<void> {
  try {
    await logout();
  } finally {
    void getBridge().disconnect?.();
    await refreshData();
  }
}

/** Kompatibilitas: keluar sepenuhnya (sesi + wallet). */
export const disconnectWallet = () => void signOut();

export function useWallet() {
  const bridge = useBridge();
  const data = useStore();
  const wallet = bridge.publicKey;
  const session = data?.session ?? null;
  const loggedIn = !!session && !!wallet && session.wallet === wallet;
  const role: Role = loggedIn ? session!.role : "publik";
  const recipient =
    role === "penerima"
      ? (data?.recipients.find((r) => r.recipientId === session!.recipientId) ?? null)
      : null;
  return {
    wallet,
    role,
    recipient,
    loggedIn,
    /** Wallet terhubung tetapi belum login (atau ganti akun di Phantom). */
    needsLogin: !!wallet && !loggedIn,
    admins: data?.admins ?? [],
    balanceLamports: bridge.balanceLamports,
    walletReady: bridge.ready,
  };
}

export function useIsAdminWallet() {
  const data = useStore();
  return (a: string | null) => !!a && !!data?.admins.includes(a);
}

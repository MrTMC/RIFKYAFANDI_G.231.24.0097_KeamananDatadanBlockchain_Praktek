import "@/lib/polyfills";
import { useEffect, useMemo, type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { setBridge } from "@/lib/solanaBridge";
import { refreshBalance } from "@/services/blockchainService";

const RPC =
  (import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined) || clusterApiUrl("devnet");

function Bridge() {
  const { publicKey, sendTransaction, signMessage, disconnect, wallets } = useWallet();
  const pk = publicKey?.toBase58() ?? null;
  const phantom = wallets.find((w) => w.adapter.name === "Phantom");
  const detected = phantom ? phantom.readyState === WalletReadyState.Installed : false;
  useEffect(() => {
    setBridge({
      ready: true,
      publicKey: pk,
      balanceLamports: null,
      sendTransaction: pk ? (tx, c) => sendTransaction(tx, c) : null,
      signMessage: pk && signMessage ? (m) => signMessage(m) : null,
      disconnect,
    });
    if (pk) void refreshBalance();
  }, [pk, sendTransaction, signMessage, disconnect]);
  useEffect(() => {
    // Ekstensi kadang baru menyuntikkan diri sesaat setelah halaman dimuat.
    setBridge({ phantomDetected: detected });
  }, [detected]);
  return null;
}

export default function SolanaProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <Bridge />
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

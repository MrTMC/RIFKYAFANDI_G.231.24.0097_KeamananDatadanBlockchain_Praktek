// Tombol hubungkan Phantom (satu klik, tanpa modal). Dimuat lazy & hanya di browser.
// Jika ekstensi tidak terdeteksi, TIDAK mengalihkan ke situs Phantom — tampilkan petunjuk.
import { useState } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, Loader2, RefreshCw, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/wallet";
import { isLocalHost, isMobileDevice, phantomBrowseUrl } from "@/lib/mobile";

export default function WalletButton() {
  const { wallets, wallet, select, connect, connecting, connected, publicKey } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const phantom = wallets.find((w) => w.adapter.name === "Phantom");
  const installed = phantom?.readyState === WalletReadyState.Installed;

  if (connected && publicKey) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Wallet className="h-4 w-4" /> Phantom terhubung
        </div>
        {/* Phantom menyambung ulang diam-diam ke akun yang AKTIF di ekstensi, jadi
            untuk pindah akun: putuskan di sini, pilih akun lain di Phantom, hubungkan lagi. */}
        <Button size="sm" variant="outline" onClick={() => void signOut()}>
          <RefreshCw className="h-3.5 w-3.5" /> Ganti akun
        </Button>
      </div>
    );
  }

  // HP tanpa wallet tersuntik (Chrome/Safari biasa): arahkan ke browser di aplikasi Phantom.
  if (!installed && isMobileDevice()) {
    return (
      <div className="space-y-2">
        <a
          href={phantomBrowseUrl()}
          className="inline-flex items-center gap-2 rounded-md bg-[#512da8] px-4 py-2 text-sm font-medium text-white hover:bg-[#45259a]"
        >
          <Smartphone className="h-4 w-4" /> Buka di aplikasi Phantom
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="text-sm text-muted-foreground">
          Di HP, wallet hanya bisa dipakai dari browser di dalam aplikasi Phantom. Tombol ini
          membuka halaman ini di sana (pasang dulu aplikasi Phantom dari Play Store / App Store bila
          belum).
        </p>
        {isLocalHost() && (
          <p className="text-sm text-destructive">
            Alamat localhost tidak bisa dibuka dari HP. Gunakan alamat web yang sudah online
            (Vercel).
          </p>
        )}
      </div>
    );
  }

  const onClick = async () => {
    setError(null);
    if (!phantom || !installed) {
      setError(
        "Phantom tidak terdeteksi. Pasang ekstensi Phantom di browser ini, izinkan aksesnya ke situs ini, lalu muat ulang halaman.",
      );
      return;
    }
    try {
      if (wallet?.adapter.name !== phantom.adapter.name) {
        // autoConnect pada WalletProvider akan langsung menghubungkan setelah dipilih.
        select(phantom.adapter.name);
      } else {
        await connect();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghubungkan Phantom.");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={() => void onClick()}
        disabled={connecting}
        className="bg-[#512da8] hover:bg-[#45259a] text-white"
      >
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {connecting ? "Menghubungkan…" : "Hubungkan Phantom"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

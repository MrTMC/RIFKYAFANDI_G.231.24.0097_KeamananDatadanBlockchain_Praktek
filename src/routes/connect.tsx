import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Copy, LogIn, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn, useWallet } from "@/lib/wallet";
import { useBridge } from "@/lib/solanaBridge";
import { useStore } from "@/lib/store";
import { ErrorBox, Loading, PageTitle, Warn } from "@/components/states";

const WalletButton = lazy(() =>
  import.meta.env.SSR
    ? Promise.resolve({ default: (): ReactNode => null })
    : import("@/components/WalletButton"),
);

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Masuk — AidTrace Receipt" },
      {
        name: "description",
        content: "Masuk dengan wallet Phantom (Solana devnet) sebagai Admin atau Penerima.",
      },
      { property: "og:title", content: "Masuk — AidTrace Receipt" },
      {
        property: "og:description",
        content: "Masuk dengan wallet Phantom (Solana devnet) sebagai Admin atau Penerima.",
      },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const store = useStore();
  const { wallet, role, loggedIn, needsLogin, walletReady, balanceLamports } = useWallet();
  const { phantomDetected } = useBridge();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const registeredAs = !wallet
    ? ""
    : store?.admins.includes(wallet)
      ? "Admin"
      : (() => {
          const r = store?.recipients.find((x) => x.walletAddress === wallet && x.aktif);
          return r ? `Penerima (${r.recipientId})` : "belum terdaftar (publik)";
        })();

  // Arahkan ke dashboard hanya tepat setelah login di halaman ini, supaya pengguna yang
  // sudah masuk tetap bisa membuka halaman ini untuk ganti akun.
  const [justSignedIn, setJustSignedIn] = useState(false);
  useEffect(() => {
    if (!justSignedIn || !loggedIn) return;
    if (role === "admin") nav({ to: "/admin" });
    else if (role === "penerima") nav({ to: "/penerima" });
  }, [justSignedIn, loggedIn, role, nav]);

  const doSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn();
      setJustSignedIn(true);
      toast.success("Berhasil masuk");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle
        title="Masuk"
        sub="Hubungkan Phantom (jaringan Solana devnet), lalu tanda tangani pesan login."
      />
      <div
        className="rounded-xl border-2 border-primary/30 bg-secondary p-4 flex gap-3 text-secondary-foreground mb-6"
        role="note"
      >
        <ShieldAlert className="h-6 w-6 shrink-0" />
        <p className="font-semibold">
          AidTrace tidak akan pernah meminta seed phrase atau private key. Login hanya
          menandatangani pesan — tidak ada dana yang berpindah.
        </p>
      </div>

      {!store || !walletReady ? (
        <Loading text="Menyiapkan wallet…" />
      ) : (
        <div className="rounded-xl border bg-card p-6 shadow-card space-y-4">
          {phantomDetected === false && !wallet && (
            <Warn>
              Ekstensi Phantom tidak terdeteksi di browser ini. Pastikan Phantom terpasang di{" "}
              <b>browser dan profil yang sama</b>, akses situsnya diizinkan (chrome://extensions →
              Phantom → Site access: On all sites), lalu muat ulang halaman (Ctrl+Shift+R).
            </Warn>
          )}

          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              1
            </span>
            Hubungkan wallet
          </div>
          <Suspense fallback={<Loading text="Memuat tombol wallet…" />}>
            <WalletButton />
          </Suspense>

          {wallet && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono break-all">{wallet}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(wallet)
                      .then(() => toast.success("Alamat wallet disalin"))
                  }
                >
                  <Copy className="h-3.5 w-3.5" /> Salin alamat
                </Button>
              </div>
              <p className="text-sm">
                Wallet ini terdaftar sebagai: <b>{registeredAs}</b>
              </p>
              <SwitchAccountHelp />
              {balanceLamports === 0 && (
                <Warn>
                  Saldo 0 SOL. Untuk mengirim transaksi, ambil SOL devnet gratis (bukan uang nyata)
                  di{" "}
                  <a
                    className="underline"
                    href="https://faucet.solana.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    faucet.solana.com
                  </a>
                  .
                </Warn>
              )}

              <div className="flex items-center gap-2 text-sm font-semibold pt-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  2
                </span>
                Masuk
              </div>
              {needsLogin && (
                <Button onClick={doSignIn} disabled={busy}>
                  <LogIn className="h-4 w-4" />{" "}
                  {busy ? "Menunggu tanda tangan di Phantom…" : "Masuk dengan wallet ini"}
                </Button>
              )}
              {error && <ErrorBox>{error}</ErrorBox>}

              {loggedIn && role !== "publik" && (
                <div className="rounded-lg border p-4 text-sm">
                  Anda sudah masuk sebagai <b>{role === "admin" ? "Admin" : "Penerima"}</b>.{" "}
                  <Link
                    to={role === "admin" ? "/admin" : "/penerima"}
                    className="font-semibold text-primary underline"
                  >
                    Buka {role === "admin" ? "Dashboard" : "Bantuan Saya"}
                  </Link>
                </div>
              )}
              {loggedIn && role === "publik" && (
                <div className="rounded-lg border p-4 space-y-1 text-sm">
                  <div className="font-semibold">Wallet ini belum terdaftar</div>
                  <p className="text-muted-foreground">
                    Anda masuk sebagai publik. Jika Anda penerima bantuan, kirim alamat wallet di
                    atas kepada admin penyalur agar didaftarkan. Halaman <b>Audit</b> tetap bisa
                    dibuka siapa pun.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Phantom selalu memakai akun yang sedang AKTIF di ekstensi, dan untuk situs yang sudah
 *  diizinkan ia menyambung tanpa menampilkan jendela. Jadi ganti akunnya di Phantom. */
function SwitchAccountHelp() {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        Ingin masuk dengan akun lain (mis. akun penerima)?
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>
          Buka ekstensi <b>Phantom</b> → klik nama akun di kiri atas → pilih akun penerima (atau{" "}
          <b>Add / Connect Wallet → Create new account</b> untuk membuat akun baru).
        </li>
        <li>
          Aplikasi biasanya langsung mendeteksi akun baru. Jika alamat di atas tidak berubah, klik{" "}
          <b>Ganti akun</b>, lalu <b>Hubungkan Phantom</b> lagi — Phantom akan meminta izin untuk
          akun tersebut.
        </li>
        <li>
          Klik <b>Masuk dengan wallet ini</b> dan setujui tanda tangan pesan.
        </li>
        <li>
          Akun penerima juga butuh sedikit SOL devnet untuk biaya transaksi konfirmasi — ambil
          gratis di faucet.solana.com.
        </li>
      </ol>
    </details>
  );
}

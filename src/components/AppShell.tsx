import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ReactNode } from "react";
import {
  Home,
  LayoutDashboard,
  Users,
  FilePlus2,
  Search,
  Wallet,
  Inbox,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { useWallet, signOut } from "@/lib/wallet";

type Item = {
  to:
    | "/"
    | "/audit"
    | "/connect"
    | "/admin"
    | "/admin/penerima"
    | "/admin/program"
    | "/admin/catat"
    | "/penerima";
  label: string;
  icon: typeof Home;
};

export function AppShell({ children }: { children: ReactNode }) {
  const { wallet, role, needsLogin } = useWallet();
  const nav = useNavigate();
  // Setelah keluar selalu kembali ke Beranda, apa pun halaman & peran sebelumnya.
  const doSignOut = async () => {
    // Pindah ke Beranda dulu, baru hapus sesi — supaya penjaga halaman terbatas
    // tidak sempat mengalihkan ke halaman Masuk.
    await nav({ to: "/" });
    await signOut();
    toast.success("Anda sudah keluar");
  };
  const items: Item[] =
    role === "admin"
      ? [
          { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
          { to: "/admin/penerima", label: "Penerima", icon: Users },
          { to: "/admin/program", label: "Program", icon: Tags },
          { to: "/admin/catat", label: "Catat", icon: FilePlus2 },
          { to: "/audit", label: "Audit", icon: Search },
        ]
      : role === "penerima"
        ? [
            { to: "/penerima", label: "Bantuan Saya", icon: Inbox },
            { to: "/audit", label: "Audit", icon: Search },
            { to: "/connect", label: "Wallet", icon: Wallet },
          ]
        : [
            { to: "/", label: "Beranda", icon: Home },
            { to: "/audit", label: "Audit", icon: Search },
            { to: "/connect", label: "Hubungkan", icon: Wallet },
          ];
  const roleLabel = role === "admin" ? "Admin" : role === "penerima" ? "Penerima" : "Publik";

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-sidebar text-sidebar-foreground">
        <Link to="/" className="flex items-center gap-2 px-6 py-6 font-bold text-lg">
          <ShieldCheck className="h-6 w-6 text-sidebar-primary" /> AidTrace Receipt
        </Link>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <it.icon className="h-4 w-4" /> {it.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border text-xs space-y-2">
          <div>
            Peran: <span className="font-semibold text-sidebar-primary">{roleLabel}</span>
          </div>
          {wallet ? (
            <>
              <div className="font-mono break-all opacity-80">
                {wallet.slice(0, 6)}…{wallet.slice(-4)}
              </div>
              {needsLogin && (
                <Link to="/connect" className="block font-semibold text-sidebar-primary underline">
                  Masuk dengan wallet
                </Link>
              )}
              <button onClick={() => void doSignOut()} className="underline">
                Keluar
              </button>
            </>
          ) : (
            <Link to="/connect" className="underline">
              Hubungkan wallet
            </Link>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 md:ml-64 flex flex-col min-h-screen pb-16 md:pb-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground">
          <span className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-5 w-5 text-sidebar-primary" /> AidTrace
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs rounded-full bg-sidebar-accent px-2 py-1">{roleLabel}</span>
            {wallet && (
              <button onClick={() => void doSignOut()} className="text-xs underline">
                Keluar
              </button>
            )}
          </span>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
        <footer className="px-4 py-3 text-center text-xs bg-warning-soft text-foreground border-t">
          AidTrace Receipt — bukti distribusi tercatat di Solana devnet (jaringan uji)
        </footer>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t flex">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            activeOptions={{ exact: true }}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <it.icon className="h-5 w-5" /> {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, useStore, type Status } from "@/lib/store";
import { useWallet } from "@/lib/wallet";

export function Loading({ text = "Memuat data…" }: { text?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" /> {text}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-soft p-4 text-sm text-destructive"
    >
      <AlertTriangle className="h-5 w-5 shrink-0" /> <div>{children}</div>
    </div>
  );
}
export function Warn({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-foreground"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" /> <div>{children}</div>
    </div>
  );
}
/**
 * Penjaga halaman terbatas — tidak menampilkan halaman "khusus …", langsung mengalihkan:
 *  - belum masuk / sudah keluar      → halaman Masuk (/connect)
 *  - masuk sebagai peran lain        → halamannya sendiri (/admin atau /penerima)
 * Saat halaman dimuat ulang, Phantom butuh sesaat untuk tersambung kembali; selama ada
 * sesi di server kita tunggu sebentar agar tidak salah mengalihkan.
 */
export function NoAccess(_props: { need: "Admin" | "Penerima" }) {
  const { role, wallet } = useWallet();
  const data = useStore();
  const nav = useNavigate();
  const hasSession = !!data?.session;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);
  const target =
    role === "admin"
      ? "/admin"
      : role === "penerima"
        ? "/penerima"
        : hasSession && !wallet && !waited
          ? null // tunggu Phantom tersambung ulang
          : "/connect";
  useEffect(() => {
    if (target) void nav({ to: target, replace: true });
  }, [target, nav]);
  return <Loading text="Mengalihkan…" />;
}

export function StatusBadge({ s }: { s: Status }) {
  const cls =
    s === "DIKONFIRMASI_SESUAI"
      ? "bg-success-soft text-success border-success/30"
      : s === "DIKONFIRMASI_TIDAK_SESUAI"
        ? "bg-destructive-soft text-destructive border-destructive/30"
        : "bg-secondary text-secondary-foreground border-transparent";
  return (
    <Badge variant="outline" className={cls}>
      {STATUS_LABEL[s]}
    </Badge>
  );
}
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
export const selectCls =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

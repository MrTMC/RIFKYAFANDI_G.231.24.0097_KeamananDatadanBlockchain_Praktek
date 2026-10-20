import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";
import { rupiah, useStore, useStoreError, type Distribution } from "@/lib/store";
import {
  cancelDistribution,
  finalizeDistribution,
  PendingVerificationError,
  sendDistributionTx,
} from "@/lib/actions";
import {
  Empty,
  ErrorBox,
  Loading,
  NoAccess,
  PageTitle,
  StatusBadge,
  Warn,
} from "@/components/states";
import { Stat } from "@/components/Stat";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard Admin — AidTrace Receipt" },
      { name: "description", content: "Ringkasan distribusi bantuan untuk admin program." },
      { property: "og:title", content: "Dashboard Admin — AidTrace Receipt" },
      { property: "og:description", content: "Ringkasan distribusi bantuan untuk admin program." },
    ],
  }),
  component: AdminDash,
});

function AdminDash() {
  const store = useStore();
  const err = useStoreError();
  const { role } = useWallet();
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "admin") return <NoAccess need="Admin" />;
  const ds = store.distributions;
  const pending = ds.filter((d) => d.status === "MENUNGGU_CHAIN");
  const recorded = ds.filter((d) => d.status !== "MENUNGGU_CHAIN");
  const recent = [...recorded].sort((a, b) => b.recordId.localeCompare(a.recordId)).slice(0, 8);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Dashboard Admin" sub="Ringkasan program bantuan" />
        <div className="flex gap-2 mb-6">
          <Button asChild>
            <Link to="/admin/catat">Catat distribusi</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Penerima aktif"
          value={String(store.recipients.filter((r) => r.aktif).length)}
        />
        <Stat label="Distribusi tercatat" value={String(recorded.length)} />
        <Stat
          label="Menunggu konfirmasi penerima"
          value={String(ds.filter((d) => d.status === "TERCATAT").length)}
        />
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft shadow-card">
          <h2 className="px-5 py-4 font-semibold border-b border-warning/30">
            Belum tercatat di devnet ({pending.length})
          </h2>
          <p className="px-5 pt-3 text-sm text-muted-foreground">
            Distribusi ini sudah disiapkan tetapi transaksinya belum terverifikasi. Kirim ke devnet
            atau batalkan. Data ini tidak tampil di halaman audit publik.
          </p>
          <ul className="divide-y divide-warning/20">
            {pending.map((d) => (
              <PendingRow key={d.recordId} d={d} />
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-card">
        <h2 className="px-5 py-4 font-semibold border-b">Distribusi terbaru</h2>
        {recent.length === 0 ? (
          <div className="p-5">
            <Empty title="Belum ada distribusi">
              Mulai dari menu Penerima, lalu Catat distribusi.
            </Empty>
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((d) => (
              <li key={d.recordId}>
                <Link
                  to="/distribusi/$id"
                  params={{ id: d.recordId }}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-muted"
                >
                  <span className="font-mono text-sm">
                    {d.recordId} · {d.recipientId}
                  </span>
                  <span className="text-sm">{rupiah(d.amount)}</span>
                  <StatusBadge s={d.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingRow({ d }: { d: Distribution }) {
  const [busy, setBusy] = useState<"send" | "retry" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const act = async (kind: "send" | "retry" | "cancel") => {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "cancel") {
        await cancelDistribution(d.recordId);
        toast("Distribusi dibatalkan");
      } else if (kind === "retry" && sig) {
        await finalizeDistribution(d.recordId, sig);
        toast.success(`${d.recordId} tercatat`);
      } else {
        await sendDistributionTx(d.recordId, d.hash);
        toast.success(`${d.recordId} tercatat`);
      }
    } catch (e) {
      if (e instanceof PendingVerificationError) setSig(e.signature);
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="px-5 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm">
          {d.recordId} · {d.recipientId} · {rupiah(d.amount)}
        </span>
        <div className="flex flex-wrap gap-2">
          {sig ? (
            <Button size="sm" onClick={() => act("retry")} disabled={!!busy}>
              {busy === "retry" ? "Memeriksa…" : "Cek ulang transaksi"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => act("send")} disabled={!!busy}>
              {busy === "send" ? "Menunggu Phantom…" : "Kirim ke devnet"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => act("cancel")} disabled={!!busy}>
            {busy === "cancel" ? "…" : "Batalkan"}
          </Button>
        </div>
      </div>
      {error && <Warn>{error}</Warn>}
    </li>
  );
}

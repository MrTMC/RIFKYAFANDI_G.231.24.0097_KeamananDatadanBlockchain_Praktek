import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { verifyAll } from "@/lib/verify";
import { Label } from "@/components/ui/label";
import { STATUS_LABEL, rupiah, useStore, useStoreError, type Status } from "@/lib/store";
import { explorerUrl } from "@/services/blockchainService";
import { Empty, ErrorBox, Loading, PageTitle, StatusBadge, selectCls } from "@/components/states";
import { Stat } from "@/components/Stat";
import { VerifyButton } from "@/components/VerifyButton";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Publik — AidTrace Receipt" },
      {
        name: "description",
        content:
          "Tabel distribusi bantuan, verifikasi hash, dan statistik konfirmasi — tanpa login.",
      },
      { property: "og:title", content: "Audit Publik — AidTrace Receipt" },
      {
        property: "og:description",
        content:
          "Tabel distribusi bantuan, verifikasi hash, dan statistik konfirmasi — tanpa login.",
      },
    ],
  }),
  component: Audit,
});

const STATUSES = Object.keys(STATUS_LABEL) as Status[];

function Audit() {
  const store = useStore();
  const err = useStoreError();
  const [prog, setProg] = useState("");
  const [stat, setStat] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  // Hanya field non-identitas; nama penerima tidak pernah dibaca di halaman ini.
  const jenjangOf = new Map(store.recipients.map((r) => [r.recipientId, r.jenjang]));
  const all = store.distributions;
  const rows = all.filter((d) => (!prog || d.program === prog) && (!stat || d.status === stat));
  const total = all.reduce((s, d) => s + d.amount, 0);
  const confirmed = all.filter((d) => d.status !== "TERCATAT").length;
  const bad = all.filter((d) => d.status === "DIKONFIRMASI_TIDAK_SESUAI").length;
  const walletOf = new Map(store.recipients.map((r) => [r.recipientId, r.walletAddress]));
  const busy = progress !== null && progress.done < progress.total;
  const checkAll = () =>
    void verifyAll(
      rows.map((d) => ({ d, wallet: walletOf.get(d.recipientId) ?? null })),
      store.admins,
      (done, total) => setProgress({ done, total }),
    );

  return (
    <div className="space-y-6">
      <PageTitle
        title="Audit publik"
        sub="Siapa pun dapat memeriksa tanpa login. Identitas penerima tidak ditampilkan."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total disalurkan" value={rupiah(total)} />
        <Stat
          label="Dikonfirmasi penerima"
          value={`${all.length ? Math.round((confirmed / all.length) * 100) : 0}%`}
          tone="success"
        />
        <Stat label="Laporan tidak sesuai" value={String(bad)} tone="danger" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="fp">Program</Label>
          <select
            id="fp"
            className={selectCls}
            value={prog}
            onChange={(e) => setProg(e.target.value)}
          >
            <option value="">Semua program</option>
            {(store?.programs ?? []).map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fs">Status</Label>
          <select
            id="fs"
            className={selectCls}
            value={stat}
            onChange={(e) => setStat(e.target.value)}
          >
            <option value="">Semua status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={checkAll} disabled={busy || rows.length === 0}>
          <ShieldCheck className="h-4 w-4" />{" "}
          {busy ? "Memverifikasi…" : `Verifikasi semua (${rows.length})`}
        </Button>
        {progress && (
          <div
            className="flex items-center gap-2 min-w-48 flex-1 max-w-sm"
            role="status"
            aria-live="polite"
          >
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-2" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}
        <p className="basis-full text-xs text-muted-foreground">
          Verifikasi membaca transaksi langsung dari Solana devnet: format memo, hash, signer admin,
          dan konfirmasi penerima. Klik badge hasil untuk melihat rinciannya.
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty title="Tidak ada data">Ubah filter untuk melihat distribusi lain.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {[
                  "Record",
                  "Penerima",
                  "Program",
                  "Jenjang",
                  "Nominal",
                  "Tanggal",
                  "Status",
                  "Explorer",
                  "Verifikasi",
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => (
                <tr key={d.recordId}>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">{d.recordId}</td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">{d.recipientId}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.program}</td>
                  <td className="px-4 py-3">{jenjangOf.get(d.recipientId) ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{rupiah(d.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.date}</td>
                  <td className="px-4 py-3">
                    <StatusBadge s={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    {d.distSignature && (
                      <a
                        className="text-primary underline whitespace-nowrap"
                        href={explorerUrl(d.distSignature)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.distSignature.slice(0, 8)}…
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <VerifyButton d={d} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

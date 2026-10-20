import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";
import { rupiah, useStore, useStoreError } from "@/lib/store";
import { explorerUrl, getRecordOnChain } from "@/services/blockchainService";
import { Empty, ErrorBox, Loading, NoAccess, PageTitle, StatusBadge } from "@/components/states";
import { VerifyButton } from "@/components/VerifyButton";

export const Route = createFileRoute("/distribusi/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Detail ${params.id} — AidTrace Receipt` },
      { name: "description", content: `Detail distribusi ${params.id}: hash, signature, dan status.` },
      { property: "og:title", content: `Detail ${params.id} — AidTrace Receipt` },
      { property: "og:description", content: `Detail distribusi ${params.id}: hash, signature, dan status.` },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const store = useStore();
  const err = useStoreError();
  const { role } = useWallet();
  const [chain, setChain] = useState<string | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "admin") return <NoAccess need="Admin" />;
  const d = store.distributions.find((x) => x.recordId === id);
  if (!d) return <Empty title={`Distribusi ${id} tidak ditemukan`}><Link to="/admin" className="underline text-primary">Kembali</Link></Empty>;
  const r = store.recipients.find((x) => x.recipientId === d.recipientId);

  const lookup = async () => {
    if (!d.distSignature) return;
    setLoadingChain(true);
    try {
      const res = await getRecordOnChain(d.distSignature);
      setChain(
        res
          ? `memo: ${res.memo}\nsigner: ${res.signer}\nblockTime: ${new Date(res.blockTime * 1000).toLocaleString("id-ID")}`
          : "Transaksi tidak ditemukan di devnet.",
      );
    } catch (e) {
      setChain(e instanceof Error ? e.message : "Gagal membaca devnet.");
    } finally {
      setLoadingChain(false);
    }
  };

  const rows: [string, ReactNode][] = [
    ["Penerima", `${d.recipientId}${r?.nama ? ` · ${r.nama}` : ""}`],
    ["Program", d.program], ["Nominal resmi", rupiah(d.amount)],
    ["Nominal diterima", d.actualAmount != null ? rupiah(d.actualAmount) : "—"],
    ["Tanggal", d.date], ["Periode", d.period],
    ["Salt", <span className="font-mono break-all">{d.salt}</span>],
    ["Hash", <span className="font-mono break-all">{d.hash}</span>],
    ["Signature distribusi", d.distSignature ? <a className="font-mono break-all text-primary underline" href={explorerUrl(d.distSignature)} target="_blank" rel="noreferrer">{d.distSignature}</a> : "Belum dikirim ke devnet"],
    ["Dicatat oleh", <span className="font-mono break-all">{d.createdBy}</span>],
    ["Signature konfirmasi", d.confSignature ? <a className="font-mono break-all text-primary underline" href={explorerUrl(d.confSignature)} target="_blank" rel="noreferrer">{d.confSignature}</a> : "—"],
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3"><PageTitle title={d.recordId} /><div className="mb-6"><StatusBadge s={d.status} /></div></div>
      <dl className="rounded-xl border bg-card shadow-card divide-y">
        {rows.map(([k, v]) => (
          <div key={k} className="grid sm:grid-cols-3 gap-1 px-5 py-3 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="sm:col-span-2">{v}</dd></div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 items-center">
        <VerifyButton d={d} />
        <Button variant="outline" onClick={lookup} disabled={loadingChain || !d.distSignature}>{loadingChain ? "Memuat…" : "Cek data on-chain"}</Button>
      </div>
      {chain && <pre className="rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap break-all font-mono">{chain}</pre>}
      <p className="text-xs text-muted-foreground">
        Uji deteksi perubahan data (T5): ubah kolom <code>amount</code> distribusi ini langsung di database (Supabase →
        Table Editor → distributions), lalu buka halaman Audit dan klik Verifikasi — hasilnya harus "Tidak cocok".
      </p>
    </div>
  );
}

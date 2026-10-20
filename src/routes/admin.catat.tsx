import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/wallet";
import { recordNewDistribution } from "@/lib/actions";
import { useStore, useStoreError } from "@/lib/store";
import { ErrorBox, Loading, NoAccess, PageTitle, Warn, selectCls } from "@/components/states";

export const Route = createFileRoute("/admin/catat")({
  head: () => ({
    meta: [
      { title: "Catat Distribusi — AidTrace Receipt" },
      { name: "description", content: "Catat distribusi bantuan baru beserta hash dan signature." },
      { property: "og:title", content: "Catat Distribusi — AidTrace Receipt" },
      {
        property: "og:description",
        content: "Catat distribusi bantuan baru beserta hash dan signature.",
      },
    ],
  }),
  component: RecordPage,
});

function RecordPage() {
  const store = useStore();
  const err = useStoreError();
  const { role } = useWallet();
  const [f, setF] = useState({ recipientId: "", program: "", amount: "", date: "", period: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    recordId: string;
    hash: string;
    signature: string;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "admin") return <NoAccess need="Admin" />;
  const active = store.recipients.filter((r) => r.aktif);
  const activePrograms = store.programs.filter((p) => p.aktif).map((p) => p.name);

  const submit = async () => {
    const e: string[] = [];
    const rec = store.recipients.find((r) => r.recipientId === f.recipientId);
    if (!rec) e.push("Pilih penerima.");
    else if (!rec.aktif) e.push("Penerima tidak aktif.");
    else if (!activePrograms.includes(rec.program))
      e.push(
        `Program "${rec.program}" milik penerima ini sedang nonaktif — aktifkan di menu Program atau ubah program penerima.`,
      );
    const amount = Number(f.amount);
    if (!Number.isInteger(amount) || amount <= 0) e.push("Nominal harus bilangan bulat > 0.");
    if (amount > 1_000_000_000) e.push("Nominal terlalu besar.");
    const dt = new Date(f.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || isNaN(dt.getTime())) e.push("Tanggal tidak valid.");
    const period = f.period.trim();
    if (!period || period.length > 40) e.push("Periode wajib diisi (maks. 40 karakter).");
    setErrors(e);
    if (e.length) return;
    setBusy(true);
    setPendingId(null);
    setResult(null);
    let preparedId: string | null = null;
    try {
      const r = await recordNewDistribution({
        recipientId: f.recipientId,
        program: f.program,
        amount,
        date: f.date,
        period,
      });
      preparedId = r.recordId;
      setResult(r);
      toast.success(`${r.recordId} tercatat dan terverifikasi di devnet`);
      setF({ recipientId: "", program: "", amount: "", date: "", period: "" });
    } catch (x) {
      const latest = store.distributions
        .filter((d) => d.status === "MENUNGGU_CHAIN")
        .map((d) => d.recordId);
      preparedId = preparedId ?? latest.at(-1) ?? null;
      setPendingId(preparedId);
      setErrors([x instanceof Error ? x.message : "Gagal mencatat distribusi."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle
        title="Catat distribusi"
        sub="Hash dihitung otomatis; nama penerima tidak ikut di-hash."
      />
      <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="r">Penerima (aktif)</Label>
            <select
              id="r"
              className={selectCls}
              value={f.recipientId}
              onChange={(e) => {
                const r = active.find((x) => x.recipientId === e.target.value);
                // Program selalu mengikuti data penerima (tidak bisa diganti di sini).
                setF({ ...f, recipientId: e.target.value, program: r?.program ?? "" });
              }}
            >
              <option value="">— pilih —</option>
              {active.map((r) => (
                <option key={r.recipientId} value={r.recipientId}>
                  {r.recipientId} · {r.jenjang} · {r.program}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Program</Label>
            <Input
              id="p"
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className="bg-muted cursor-not-allowed"
              value={f.program || "— pilih penerima dulu —"}
            />
            <p className="text-xs text-muted-foreground">
              Otomatis sesuai program penerima. Untuk mengganti, ubah data penerima di menu{" "}
              <Link to="/admin/penerima" className="underline">
                Penerima
              </Link>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a">Nominal (Rp)</Label>
            <Input
              id="a"
              type="number"
              min={1}
              inputMode="numeric"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d">Tanggal</Label>
            <Input
              id="d"
              type="date"
              value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe">Periode</Label>
            <Input
              id="pe"
              placeholder="2026 Semester 2"
              maxLength={40}
              value={f.period}
              onChange={(e) => setF({ ...f, period: e.target.value })}
            />
          </div>
        </div>
        {errors.length > 0 && (
          <ErrorBox>
            <ul className="list-disc pl-4">
              {errors.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </ErrorBox>
        )}
        {pendingId && (
          <Warn>
            Distribusi sudah disiapkan tetapi belum tercatat di devnet. Lanjutkan atau batalkan dari{" "}
            <Link to="/admin" className="underline font-semibold">
              Dashboard
            </Link>
            .
          </Warn>
        )}
        <Button onClick={submit} disabled={busy}>
          {busy ? "Menunggu Phantom & verifikasi devnet…" : "Simpan & catat ke devnet"}
        </Button>
      </div>
      {result && (
        <div className="rounded-xl border border-success/40 bg-success-soft p-5 space-y-2 text-sm">
          <div className="font-semibold text-success">Berhasil: {result.recordId}</div>
          <div>
            <span className="text-muted-foreground">Hash:</span>{" "}
            <span className="font-mono break-all">{result.hash}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Signature:</span>{" "}
            <a
              className="font-mono break-all text-primary underline"
              href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              {result.signature}
            </a>
          </div>
          <Link
            to="/distribusi/$id"
            params={{ id: result.recordId }}
            className="text-primary font-semibold underline"
          >
            Lihat detail
          </Link>
        </div>
      )}
    </div>
  );
}

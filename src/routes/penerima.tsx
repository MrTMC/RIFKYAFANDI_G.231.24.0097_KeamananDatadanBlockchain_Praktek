import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/wallet";
import { rupiah, useStore, useStoreError, type Distribution } from "@/lib/store";
import { confirmDistribution, finalizeConfirmation, PendingVerificationError } from "@/lib/actions";
import {
  Empty,
  ErrorBox,
  Loading,
  NoAccess,
  PageTitle,
  StatusBadge,
  Warn,
} from "@/components/states";

export const Route = createFileRoute("/penerima")({
  head: () => ({
    meta: [
      { title: "Bantuan Saya — AidTrace Receipt" },
      { name: "description", content: "Konfirmasi penerimaan bantuan pendidikan Anda." },
      { property: "og:title", content: "Bantuan Saya — AidTrace Receipt" },
      { property: "og:description", content: "Konfirmasi penerimaan bantuan pendidikan Anda." },
    ],
  }),
  component: RecipientDash,
});

function RecipientDash() {
  const store = useStore();
  const err = useStoreError();
  const { role, recipient, wallet, balanceLamports } = useWallet();
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "penerima" || !recipient) return <NoAccess need="Penerima" />;
  const mine = store.distributions.filter((d) => d.recipientId === recipient.recipientId);
  return (
    <div className="space-y-6">
      <PageTitle
        title="Bantuan saya"
        sub={`${recipient.recipientId} · ${recipient.jenjang} · ${recipient.program}`}
      />
      {balanceLamports === 0 && mine.some((d) => d.status === "TERCATAT") && (
        <Warn>
          Saldo wallet ini 0 SOL, sehingga Phantom tidak bisa dibuka untuk mengirim konfirmasi.
          Ambil SOL devnet gratis (bukan uang nyata) di{" "}
          <a
            className="underline"
            href="https://faucet.solana.com"
            target="_blank"
            rel="noreferrer"
          >
            faucet.solana.com
          </a>{" "}
          untuk alamat <span className="font-mono break-all">{wallet}</span>, lalu muat ulang
          halaman.
        </Warn>
      )}
      {mine.length === 0 ? (
        <Empty title="Belum ada distribusi untuk Anda" />
      ) : (
        <div className="grid gap-4">
          {mine.map((d) => (
            <ConfirmCard key={d.recordId} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmCard({ d }: { d: Distribution }) {
  const { role, recipient } = useWallet();
  const [pendingSig, setPendingSig] = useState<{
    sig: string;
    status: "SESUAI" | "TIDAK_SESUAI";
    actual: number;
  } | null>(null);
  const [mode, setMode] = useState<"idle" | "tidak">("idle");
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (status: "SESUAI" | "TIDAK_SESUAI") => {
    setError(null);
    if (role !== "penerima") {
      setError("Ditolak: hanya penerima yang bisa mengonfirmasi.");
      return;
    }
    if (!recipient || recipient.recipientId !== d.recipientId) {
      setError("Ditolak: distribusi ini bukan milik wallet Anda.");
      return;
    }
    let actualAmount = d.amount;
    if (status === "TIDAK_SESUAI") {
      actualAmount = Number(actual);
      if (!Number.isInteger(actualAmount) || actualAmount < 0 || actualAmount > 1_000_000_000) {
        setError("Isi nominal yang benar-benar diterima (bilangan bulat ≥ 0).");
        return;
      }
      if (actualAmount === d.amount) {
        setError('Nominal sama dengan nominal resmi — pilih "Sesuai".');
        return;
      }
    }
    setBusy(true);
    try {
      if (pendingSig && pendingSig.status === status) {
        await finalizeConfirmation({
          recordId: d.recordId,
          status,
          actualAmount: pendingSig.actual,
          signature: pendingSig.sig,
        });
      } else {
        await confirmDistribution({ recordId: d.recordId, hash: d.hash, status, actualAmount });
      }
      setPendingSig(null);
      toast.success("Konfirmasi tercatat dan terverifikasi di devnet");
    } catch (e) {
      if (e instanceof PendingVerificationError)
        setPendingSig({ sig: e.signature, status, actual: actualAmount });
      setError(e instanceof Error ? e.message : "Gagal mengirim konfirmasi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-sm text-muted-foreground">
            {d.recordId} · {d.period}
          </div>
          <div className="text-xl font-bold">{rupiah(d.amount)}</div>
        </div>
        <StatusBadge s={d.status} />
      </div>
      <div className="text-sm text-muted-foreground">
        {d.program} · {d.date}
      </div>
      {d.status !== "TERCATAT" ? (
        <div className="text-sm">
          Diterima: <b>{rupiah(d.actualAmount ?? d.amount)}</b>{" "}
          <span className="font-mono text-xs break-all text-muted-foreground block">
            {d.confSignature}
          </span>
        </div>
      ) : (
        <>
          {mode === "tidak" && (
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor={`a-${d.recordId}`}>Nominal yang benar-benar diterima (Rp)</Label>
              <Input
                id={`a-${d.recordId}`}
                type="number"
                min={0}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </div>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex flex-wrap gap-2">
            {mode === "idle" ? (
              <>
                <Button onClick={() => send("SESUAI")} disabled={busy}>
                  {busy ? "Mengirim…" : "Sesuai"}
                </Button>
                <Button variant="outline" onClick={() => setMode("tidak")} disabled={busy}>
                  Tidak sesuai
                </Button>
              </>
            ) : (
              <>
                <Button variant="destructive" onClick={() => send("TIDAK_SESUAI")} disabled={busy}>
                  {busy ? "Mengirim…" : "Kirim laporan tidak sesuai"}
                </Button>
                <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>
                  Batal
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

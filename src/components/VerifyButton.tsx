import {
  CheckCircle2,
  Info,
  Loader2,
  MinusCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore, type Distribution } from "@/lib/store";
import { runVerify, useVerifyEntry, type CheckState, type Verdict } from "@/lib/verify";

const VERDICT: Record<Verdict, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  cocok: { label: "Cocok", cls: "bg-success text-success-foreground", Icon: CheckCircle2 },
  tidak_cocok: {
    label: "Tidak cocok",
    cls: "bg-destructive text-destructive-foreground",
    Icon: XCircle,
  },
  error: {
    label: "Gagal cek",
    cls: "bg-warning-soft text-foreground border border-warning/40",
    Icon: Info,
  },
};
const CHECK_ICON: Record<CheckState, { Icon: typeof CheckCircle2; cls: string; sr: string }> = {
  ok: { Icon: CheckCircle2, cls: "text-success", sr: "lolos" },
  fail: { Icon: XCircle, cls: "text-destructive", sr: "gagal" },
  skip: { Icon: MinusCircle, cls: "text-muted-foreground", sr: "tidak berlaku" },
};

/** Tombol verifikasi on-chain; setelah selesai menjadi badge yang bisa diklik untuk melihat rinciannya. */
export function VerifyButton({ d, size }: { d: Distribution; size?: "sm" }) {
  const store = useStore();
  const wallet =
    store?.recipients.find((r) => r.recipientId === d.recipientId)?.walletAddress ?? null;
  const entry = useVerifyEntry(d, wallet);
  const run = () => void runVerify(d, wallet, store?.admins ?? []);

  if (entry?.busy)
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap"
        role="status"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memeriksa…
      </span>
    );
  if (!entry?.result)
    return (
      <Button size={size} variant="outline" onClick={run}>
        Verifikasi
      </Button>
    );

  const r = entry.result;
  const v = VERDICT[r.verdict];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${v.cls}`}
          aria-label={`${v.label} — lihat rincian verifikasi ${d.recordId}`}
        >
          <v.Icon className="h-3.5 w-3.5" />
          {v.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <div>
          <div className="font-semibold text-sm">Verifikasi {d.recordId}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{r.summary}</p>
        </div>
        {r.checks.length > 0 && (
          <ul className="space-y-2">
            {r.checks.map((c) => {
              const ic = CHECK_ICON[c.state];
              return (
                <li key={c.label} className="flex gap-2 text-xs">
                  <ic.Icon className={`h-4 w-4 shrink-0 ${ic.cls}`} aria-hidden />
                  <div>
                    <div className="font-medium">
                      {c.label} <span className="sr-only">({ic.sr})</span>
                    </div>
                    <div className="text-muted-foreground break-words">{c.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Button size="sm" variant="outline" className="w-full" onClick={run}>
          <RefreshCw className="h-3.5 w-3.5" /> Verifikasi ulang
        </Button>
      </PopoverContent>
    </Popover>
  );
}

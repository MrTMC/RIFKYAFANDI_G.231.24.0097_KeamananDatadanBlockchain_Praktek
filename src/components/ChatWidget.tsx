import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, X } from "lucide-react";
import { agentAiFn, tanyaRagFn } from "@/backend/fns";

type Sumber = { id: string; judul: string };
type Jejak = { tool: string; output: string };
type Pesan = {
  dari: "user" | "ai";
  teks: string;
  sumber?: Sumber[];
  jejak?: Jejak[];
  error?: boolean;
};

const SARAN = [
  "Apa arti status Tercatat?",
  "Apakah nama penerima masuk blockchain?",
  "Bagaimana cara verifikasi di audit publik?",
];
const ID_RE = /DIST-\d{4,}/i;

/**
 * Chat AI melayang (pojok kanan bawah) di semua halaman.
 * Pesan berisi id record (DIST-0001) → agent yang mengecek devnet; selain itu → RAG dari catatan lokal.
 */
export function ChatWidget() {
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState("");
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const akhir = useRef<HTMLDivElement>(null);

  useEffect(() => {
    akhir.current?.scrollIntoView({ block: "end" });
  }, [pesan, loading, buka]);

  const kirim = async (q: string) => {
    const t = q.trim();
    if (!t || loading) return;
    setTeks("");
    setPesan((p) => [...p, { dari: "user", teks: t }]);
    setLoading(true);
    try {
      const id = ID_RE.exec(t)?.[0]?.toUpperCase();
      if (id) {
        const r = await agentAiFn({ data: { pertanyaan: t, recordId: id } });
        setPesan((p) => [...p, { dari: "ai", teks: r.jawaban, jejak: r.jejak }]);
      } else {
        const r = await tanyaRagFn({ data: { pertanyaan: t } });
        setPesan((p) => [...p, { dari: "ai", teks: r.jawaban, sumber: r.sumber }]);
      }
    } catch (e) {
      setPesan((p) => [
        ...p,
        {
          dari: "ai",
          teks: e instanceof Error ? e.message : "Server AI belum jalan?",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void kirim(teks);
  };

  return (
    <>
      {buka && (
        <section
          role="dialog"
          aria-label="Asisten AI"
          className="fixed z-50 right-4 bottom-36 md:bottom-24 flex flex-col w-[min(380px,calc(100vw-2rem))] h-[min(520px,calc(100vh-11rem))] rounded-2xl border bg-card shadow-card overflow-hidden"
        >
          <header className="flex items-center justify-between gap-2 bg-sidebar text-sidebar-foreground px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <Bot className="h-5 w-5 text-sidebar-primary" /> Asisten AidTrace
            </div>
            <button
              onClick={() => setBuka(false)}
              aria-label="Tutup asisten"
              className="rounded p-1 hover:bg-sidebar-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {pesan.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Halo! Tanya soal alur dan status distribusi, atau ketik id record (contoh:
                  DIST-0008) untuk saya cek buktinya di Solana devnet.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SARAN.map((s) => (
                    <button
                      key={s}
                      onClick={() => void kirim(s)}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pesan.map((m, i) => (
              <div key={i} className={m.dari === "user" ? "flex justify-end" : "flex"}>
                <div
                  className={
                    "max-w-[88%] rounded-2xl px-3 py-2 " +
                    (m.dari === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.error
                        ? "bg-destructive-soft text-destructive border border-destructive/30"
                        : "bg-muted")
                  }
                >
                  {m.jejak && m.jejak.length > 0 && (
                    <details className="mb-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        AI memeriksa {m.jejak.length} hal
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {m.jejak.map((j, k) => (
                          <li key={k} className="break-all">
                            {j.tool}: {j.output.slice(0, 120)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.teks}</p>
                  {m.sumber && m.sumber.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground break-words">
                      Sumber: {m.sumber.map((s) => `${s.id} ${s.judul}`).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex">
                <div className="rounded-2xl bg-muted px-3 py-2 text-muted-foreground" role="status">
                  Mikir dulu…
                </div>
              </div>
            )}
            <div ref={akhir} />
          </div>

          <form onSubmit={submit} className="border-t p-2 flex gap-2 items-center">
            <input
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              maxLength={500}
              placeholder="Tulis pertanyaan atau id record…"
              aria-label="Pesan untuk asisten"
              className="h-10 flex-1 min-w-0 rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!teks.trim() || loading}
              aria-label="Kirim"
              className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="px-3 pb-2 text-[11px] text-muted-foreground">
            AI hanya memberi indikasi, bukan vonis. Nama penerima tidak pernah dikirim ke AI.
          </p>
        </section>
      )}

      <button
        onClick={() => setBuka((b) => !b)}
        aria-label={buka ? "Tutup asisten AI" : "Buka asisten AI"}
        aria-expanded={buka}
        className="fixed z-50 right-4 bottom-20 md:bottom-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-card flex items-center justify-center hover:opacity-90"
      >
        {buka ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, RotateCcw, Send, X } from "lucide-react";
import { agentAiFn } from "@/backend/fns";
import type { Role } from "@/lib/types";

type Jejak = { tool: string; output: string };
type Pesan = { dari: "user" | "ai"; teks: string; jejak?: Jejak[]; error?: boolean };

const ID_RE = /DIST-\d{4,}/i;

const LABEL_ALAT: Record<string, string> = {
  ringkasan_data: "hitung data",
  cek_bukti_onchain: "cek devnet",
  cari_pengetahuan_lokal: "baca catatan",
};

const PERAN_UI: Record<Role, { label: string; sapa: string; saran: string[] }> = {
  publik: {
    label: "Tamu",
    sapa: "Yo! Aku Si Bukti. Belum login juga boleh nanya: soal alur, status, jumlah distribusi yang sudah tercatat, atau ketik id record (contoh: DIST-0008) biar kucek buktinya di Solana devnet.",
    saran: [
      "Ada berapa distribusi yang sudah tercatat?",
      "Apa arti status Tercatat?",
      "Apakah nama penerima masuk blockchain?",
    ],
  },
  penerima: {
    label: "Penerima",
    sapa: "Halo, penerima! Aku Si Bukti. Tanya soal bantuanmu, cara konfirmasi, atau ketik id record (contoh: DIST-0008) buat kucek buktinya.",
    saran: [
      "Berapa bantuan milikku yang tercatat?",
      "Gimana cara konfirmasi bantuan?",
      "Ada berapa distribusi yang sudah tercatat?",
    ],
  },
  admin: {
    label: "Admin",
    sapa: "Siap, Admin! Aku Si Bukti. Kamu punya akses ringkasan lengkap: tanya angka, status, atau ketik id record (contoh: DIST-0008) untuk cek bukti.",
    saran: [
      "Ringkas semua data distribusi",
      "Ada berapa yang masih menunggu transaksi?",
      "Total nominal per program berapa?",
    ],
  },
};

/**
 * Chat AI melayang (pojok kanan bawah) di semua halaman, untuk tamu maupun yang sudah login.
 * Peran hanya mengubah sapaan dan saran; hak akses data ditentukan SERVER dari sesi login.
 */
export function ChatWidget({ role }: { role: Role }) {
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState("");
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const akhir = useRef<HTMLDivElement>(null);
  const ui = PERAN_UI[role];

  useEffect(() => {
    akhir.current?.scrollIntoView({ block: "end" });
  }, [pesan, loading, buka]);

  // Ganti peran (login/keluar) = percakapan baru, supaya jawaban lama tidak terbawa.
  useEffect(() => {
    setPesan([]);
  }, [role]);

  const kirim = async (q: string) => {
    const t = q.trim();
    if (!t || loading) return;
    const riwayat = pesan
      .filter((m) => !m.error)
      .slice(-6)
      .map((m) => ({ dari: m.dari, teks: m.teks.slice(0, 600) }));
    setTeks("");
    setPesan((p) => [...p, { dari: "user", teks: t }]);
    setLoading(true);
    try {
      const id = ID_RE.exec(t)?.[0]?.toUpperCase();
      const r = await agentAiFn({
        data: { pertanyaan: t, riwayat, ...(id ? { recordId: id } : {}) },
      });
      setPesan((p) => [...p, { dari: "ai", teks: r.jawaban, jejak: r.jejak }]);
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
            <div className="flex items-center gap-2 font-semibold min-w-0">
              <Bot className="h-5 w-5 shrink-0 text-sidebar-primary" />
              <span className="truncate">Si Bukti</span>
              <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[11px] font-medium">
                {ui.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {pesan.length > 0 && (
                <button
                  onClick={() => setPesan([])}
                  aria-label="Mulai obrolan baru"
                  title="Obrolan baru"
                  className="rounded p-1 hover:bg-sidebar-accent"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setBuka(false)}
                aria-label="Tutup asisten"
                className="rounded p-1 hover:bg-sidebar-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {pesan.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground">{ui.sapa}</p>
                <div className="flex flex-wrap gap-2">
                  {ui.saran.map((s) => (
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
                        Si Bukti tadi:{" "}
                        {[...new Set(m.jejak.map((j) => LABEL_ALAT[j.tool] ?? j.tool))].join(", ")}
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {m.jejak.map((j, k) => (
                          <li key={k} className="break-all">
                            {j.tool}: {j.output.slice(0, 160)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.teks}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex">
                <div className="rounded-2xl bg-muted px-3 py-2 text-muted-foreground" role="status">
                  Bentar, lagi buka-buka berkas…
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
              placeholder="Tanya apa aja soal AidTrace…"
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
            AI cuma kasih indikasi, bukan vonis. Nama penerima tidak pernah dikirim ke AI.
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

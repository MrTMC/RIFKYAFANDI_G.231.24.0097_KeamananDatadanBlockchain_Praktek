import { createFileRoute, Link } from "@tanstack/react-router";
import { FileCheck2, Hash, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AidTrace Receipt — Transparansi Bantuan Pendidikan" },
      { name: "description", content: "Setiap distribusi bantuan pendidikan tercatat dan dikonfirmasi langsung oleh penerimanya." },
      { property: "og:title", content: "AidTrace Receipt — Transparansi Bantuan Pendidikan" },
      { property: "og:description", content: "Setiap distribusi bantuan pendidikan tercatat dan dikonfirmasi langsung oleh penerimanya." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const steps = [
    { icon: Hash, t: "Dicatat & di-hash", d: "Admin mencatat distribusi. Data diringkas jadi hash SHA-256 tanpa nama penerima." },
    { icon: FileCheck2, t: "Dikonfirmasi penerima", d: "Penerima menyatakan dana diterima sesuai atau tidak sesuai dari wallet miliknya." },
    { icon: Search, t: "Diaudit publik", d: "Siapa pun dapat memverifikasi ulang hash dan melihat statistik tanpa login." },
  ];
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-hero text-primary-foreground p-8 md:p-14 shadow-card">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
          <ShieldCheck className="h-4 w-4" /> Tercatat di Solana devnet
        </div>
        <h1 className="mt-5 text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl">
          Bukti bahwa bantuan pendidikan benar-benar sampai.
        </h1>
        <p className="mt-4 max-w-xl text-primary-foreground/90">
          AidTrace Receipt mencatat setiap distribusi bantuan pendidikan (misalnya PIP, KIP Kuliah, beasiswa daerah, atau program lain yang didaftarkan admin), lalu meminta penerima mengonfirmasinya sendiri.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary"><Link to="/audit">Lihat audit publik</Link></Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent border-primary-foreground/50 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <Link to="/connect">Masuk dengan wallet</Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.t} className="rounded-xl border bg-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><s.icon className="h-5 w-5" /></span>
              <span className="text-sm text-muted-foreground">Langkah {i + 1}</span>
            </div>
            <h2 className="mt-4 font-semibold text-lg">{s.t}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

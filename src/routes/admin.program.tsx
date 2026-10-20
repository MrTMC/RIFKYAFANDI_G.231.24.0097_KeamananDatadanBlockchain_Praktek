import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet";
import { normalizeProgramName, PROGRAM_NAME_RE, useStore, useStoreError } from "@/lib/store";
import { createProgram, setProgramActive } from "@/lib/actions";
import { Empty, ErrorBox, Loading, NoAccess, PageTitle } from "@/components/states";

export const Route = createFileRoute("/admin/program")({
  head: () => ({
    meta: [
      { title: "Program Bantuan — AidTrace Receipt" },
      { name: "description", content: "Kelola daftar program bantuan pendidikan." },
      { property: "og:title", content: "Program Bantuan — AidTrace Receipt" },
      { property: "og:description", content: "Kelola daftar program bantuan pendidikan." },
    ],
  }),
  component: ProgramsPage,
});

function ProgramsPage() {
  const store = useStore();
  const err = useStoreError();
  const { role } = useWallet();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "admin") return <NoAccess need="Admin" />;

  const usage = (p: string) => ({
    penerima: store.recipients.filter((r) => r.program === p).length,
    distribusi: store.distributions.filter((d) => d.program === p).length,
  });

  const add = async () => {
    setError(null);
    const n = normalizeProgramName(name);
    if (!PROGRAM_NAME_RE.test(n)) {
      setError(
        "Nama program 2–40 karakter: huruf, angka, spasi, dan tanda . , ' ( ) / & + - saja.",
      );
      return;
    }
    if (store.programs.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      setError(`Program "${n}" sudah ada.`);
      return;
    }
    setBusy("add");
    try {
      const saved = await createProgram(n);
      toast.success(`Program "${saved}" ditambahkan`);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambah program.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (p: { name: string; aktif: boolean }) => {
    setBusy(p.name);
    try {
      await setProgramActive(p.name, !p.aktif);
      toast.success(`Program "${p.name}" ${p.aktif ? "dinonaktifkan" : "diaktifkan"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(null);
    }
  };

  const aktif = store.programs.filter((p) => p.aktif).length;

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle
        title="Program bantuan"
        sub={`${store.programs.length} program · ${aktif} aktif`}
      />

      <div className="rounded-xl border bg-card p-5 shadow-card space-y-3">
        <Label htmlFor="pn">Tambah program baru</Label>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            id="pn"
            className="max-w-sm"
            placeholder="mis. Beasiswa Prestasi"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={busy === "add" || !name.trim()}>
            {busy === "add" ? "Menyimpan…" : "Tambah"}
          </Button>
        </form>
        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-xs text-muted-foreground">
          Nama program ikut dihitung dalam hash distribusi, jadi program yang sudah dipakai tidak
          bisa dihapus atau diganti namanya — hanya bisa dinonaktifkan. Program nonaktif tidak bisa
          dipilih untuk penerima atau distribusi baru, tetapi data lamanya tetap bisa diaudit.
        </p>
      </div>

      {store.programs.length === 0 ? (
        <Empty title="Belum ada program" />
      ) : (
        <div className="grid gap-3">
          {store.programs.map((p) => {
            const u = usage(p.name);
            return (
              <div
                key={p.name}
                className="rounded-xl border bg-card p-4 shadow-card flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {u.penerima} penerima · {u.distribusi} distribusi
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.aktif ? "secondary" : "outline"}>
                    {p.aktif ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <Button
                    size="sm"
                    variant={p.aktif ? "outline" : "default"}
                    disabled={busy === p.name}
                    onClick={() => void toggle(p)}
                  >
                    {p.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

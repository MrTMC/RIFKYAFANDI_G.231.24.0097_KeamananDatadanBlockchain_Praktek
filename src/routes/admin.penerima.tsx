import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet";
import { JENJANG, useStore, useStoreError, type Recipient, type RecipientDraft } from "@/lib/store";
import { saveRecipient } from "@/lib/actions";
import {
  Empty,
  ErrorBox,
  Loading,
  NoAccess,
  PageTitle,
  Warn,
  selectCls,
} from "@/components/states";

export const Route = createFileRoute("/admin/penerima")({
  head: () => ({
    meta: [
      { title: "Manajemen Penerima — AidTrace Receipt" },
      { name: "description", content: "Tambah, ubah, dan nonaktifkan penerima bantuan." },
      { property: "og:title", content: "Manajemen Penerima — AidTrace Receipt" },
      { property: "og:description", content: "Tambah, ubah, dan nonaktifkan penerima bantuan." },
    ],
  }),
  component: RecipientsPage,
});

const schema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi").max(100),
  walletAddress: z
    .string()
    .trim()
    .min(32, "Alamat wallet minimal 32 karakter")
    .max(64)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Format alamat tidak valid (base58)"),
});

const blank: RecipientDraft = {
  nama: "",
  jenjang: "SD",
  program: "",
  walletAddress: "",
  aktif: true,
};

function walletIssues(
  list: Recipient[],
  admins: string[],
  r: { recipientId?: string; walletAddress: string },
) {
  const out: string[] = [];
  if (admins.includes(r.walletAddress))
    out.push("Wallet sama dengan wallet admin — akan ditolak server (T2).");
  const dup = list.filter(
    (x) => x.aktif && x.walletAddress === r.walletAddress && x.recipientId !== r.recipientId,
  );
  if (dup.length) out.push(`Wallet juga dipakai oleh ${dup.map((d) => d.recipientId).join(", ")}.`);
  return out;
}

function RecipientsPage() {
  const store = useStore();
  const err = useStoreError();
  const { role } = useWallet();
  const [form, setForm] = useState<typeof blank | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!store) return <Loading />;
  if (role !== "admin") return <NoAccess need="Admin" />;
  const list = store.recipients;
  const activePrograms = store.programs.filter((p) => p.aktif).map((p) => p.name);
  // Saat mengubah penerima lama yang programnya sudah dinonaktifkan, tetap tampilkan programnya.
  const programOptions =
    form && form.program && !activePrograms.includes(form.program)
      ? [...activePrograms, form.program]
      : activePrograms;

  const admins = store.admins;
  const submit = async () => {
    if (!form) return;
    const p = schema.safeParse(form);
    const issues = p.success ? [] : p.error.issues.map((i) => i.message);
    if (!form.program)
      issues.push("Pilih program (tambahkan dulu di menu Program bila belum ada).");
    if (!p.success || issues.length) {
      setErrors(issues);
      return;
    }
    setBusy("form");
    try {
      const id = await saveRecipient({ ...form, ...p.data });
      toast.success(form.recipientId ? `${id} diperbarui` : `${id} ditambahkan`);
      setForm(null);
      setErrors([]);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Gagal menyimpan."]);
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (r: Recipient) => {
    setBusy(r.recipientId);
    try {
      await saveRecipient({
        recipientId: r.recipientId,
        nama: r.nama ?? "",
        jenjang: r.jenjang,
        program: r.program,
        walletAddress: r.walletAddress,
        aktif: !r.aktif,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(null);
    }
  };
  const formIssues = form && form.walletAddress ? walletIssues(list, admins, form) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle title="Penerima" sub={`${list.length} penerima terdaftar`} />
        <Button
          onClick={() => {
            setForm({ ...blank, program: activePrograms[0] ?? "" });
            setErrors([]);
          }}
        >
          Tambah penerima
        </Button>
      </div>

      {form && (
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <h2 className="font-semibold">
            {form.recipientId ? `Ubah ${form.recipientId}` : "Penerima baru"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="n">Nama penerima</Label>
              <Input
                id="n"
                value={form.nama}
                maxLength={100}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa">Alamat wallet</Label>
              <Input
                id="wa"
                className="font-mono"
                value={form.walletAddress}
                maxLength={64}
                onChange={(e) => setForm({ ...form, walletAddress: e.target.value.trim() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j">Jenjang</Label>
              <select
                id="j"
                className={selectCls}
                value={form.jenjang}
                onChange={(e) =>
                  setForm({ ...form, jenjang: e.target.value as Recipient["jenjang"] })
                }
              >
                {JENJANG.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Program</Label>
              <select
                id="p"
                className={selectCls}
                value={form.program}
                onChange={(e) => setForm({ ...form, program: e.target.value })}
              >
                {programOptions.length === 0 && (
                  <option value="">— belum ada program aktif —</option>
                )}
                {programOptions.map((j) => (
                  <option key={j} value={j}>
                    {activePrograms.includes(j) ? j : `${j} (nonaktif)`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Program baru bisa ditambahkan di menu{" "}
                <Link to="/admin/program" className="underline">
                  Program
                </Link>
                .
              </p>
            </div>
          </div>
          {formIssues.map((i) => (
            <Warn key={i}>{i}</Warn>
          ))}
          {errors.length > 0 && <ErrorBox>{errors.join(" ")}</ErrorBox>}
          <p className="text-xs text-muted-foreground">
            Nama hanya terlihat oleh admin dan penerima yang bersangkutan, tidak pernah tampil di
            halaman audit publik maupun di blockchain.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={busy === "form"}>
              {busy === "form" ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <Empty title="Belum ada penerima" />
      ) : (
        <div className="grid gap-3">
          {list.map((r) => {
            const issues = walletIssues(list, admins, r);
            return (
              <div
                key={r.recipientId}
                className="rounded-xl border bg-card p-4 shadow-card space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.nama}</div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono">{r.recipientId}</span> · {r.jenjang} · {r.program}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.aktif ? "secondary" : "outline"}>
                      {r.aktif ? "Aktif" : "Nonaktif"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setForm({
                          recipientId: r.recipientId,
                          nama: r.nama ?? "",
                          jenjang: r.jenjang,
                          program: r.program,
                          walletAddress: r.walletAddress,
                          aktif: r.aktif,
                        });
                        setErrors([]);
                      }}
                    >
                      Ubah
                    </Button>
                    <Button
                      size="sm"
                      variant={r.aktif ? "destructive" : "default"}
                      disabled={busy === r.recipientId}
                      onClick={() => void toggle(r)}
                    >
                      {r.aktif ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </div>
                </div>
                <div className="font-mono text-xs break-all text-muted-foreground">
                  {r.walletAddress}
                </div>
                {issues.map((i) => (
                  <Warn key={i}>{i}</Warn>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

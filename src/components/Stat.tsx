export function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  const c = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${c}`}>{value}</div>
    </div>
  );
}

export function InvestmentReasonCell({ note }: { note: string | null }) {
  if (!note) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <p className="max-w-[220px] text-xs text-muted-foreground">{note}</p>;
}

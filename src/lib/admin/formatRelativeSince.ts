function pluralize(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export function formatRelativeSince(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const timestamp = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalMinutes < 1) {
    return pluralize(Math.max(1, totalSeconds), "second");
  }
  if (totalHours < 1) {
    return pluralize(totalMinutes, "minute");
  }
  if (totalDays < 1) {
    const remMinutes = totalMinutes % 60;
    return remMinutes > 0
      ? `${totalHours}h ${remMinutes}m ago`
      : `${totalHours}h ago`;
  }
  if (totalDays < 7) {
    return pluralize(totalDays, "day");
  }
  const weeks = Math.floor(totalDays / 7);
  return pluralize(weeks, "week");
}

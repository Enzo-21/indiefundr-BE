"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCountdown } from "./countdown";

type LiveCountdownProps = {
  target?: Date | string | null;
  nowIso?: string;
  className?: string;
  emptyLabel?: string;
};

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toneClass(tone: ReturnType<typeof getCountdown>["tone"]): string {
  switch (tone) {
    case "warning":
      return "text-amber-600";
    case "danger":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function LiveCountdown({
  target,
  nowIso,
  className,
  emptyLabel = "—",
}: LiveCountdownProps) {
  const [now, setNow] = useState(() => {
    if (nowIso) {
      const seeded = new Date(nowIso);
      if (!Number.isNaN(seeded.getTime())) return seeded;
    }
    return new Date();
  });
  const targetDate = useMemo(() => toDate(target), [target]);

  useEffect(() => {
    if (!targetDate) return;

    const interval = setInterval(() => {
      setNow((current) => {
        const next = new Date();
        const currentLabel = getCountdown(targetDate, current).label;
        const nextLabel = getCountdown(targetDate, next).label;
        return currentLabel === nextLabel ? current : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  if (!targetDate) {
    return <span className={className}>{emptyLabel}</span>;
  }

  const countdown = getCountdown(targetDate, now);
  const tooltip = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(targetDate);

  return (
    <div
      title={tooltip}
      className={`mt-1 inline-flex items-center gap-1 text-xs ${toneClass(countdown.tone)} ${className ?? ""}`.trim()}
    >
      <Clock3 className="h-3 w-3" />
      <span>{countdown.label}</span>
    </div>
  );
}

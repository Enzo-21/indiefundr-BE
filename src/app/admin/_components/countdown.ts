export type CountdownTone = "neutral" | "warning" | "danger";

export type CountdownResult = {
  label: string;
  tone: CountdownTone;
  isPast: boolean;
};

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatHhMmSs(deltaMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(deltaMs / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function formatDaysHours(deltaMs: number): string {
  const days = Math.floor(deltaMs / DAY_MS);
  const hours = Math.floor((deltaMs % DAY_MS) / HOUR_MS);
  return `${days}d ${hours}h`;
}

function formatElapsed(deltaMs: number): string {
  const totalMinutes = Math.floor(deltaMs / MINUTE_MS);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

export function getCountdown(
  target: Date,
  now: Date = new Date()
): CountdownResult {
  const deltaMs = target.getTime() - now.getTime();
  const abs = Math.abs(deltaMs);

  if (abs < SECOND_MS) {
    return { label: "now", tone: "warning", isPast: false };
  }

  if (deltaMs > 0) {
    if (deltaMs < DAY_MS) {
      return {
        label: `in ${formatHhMmSs(deltaMs)}`,
        tone: "warning",
        isPast: false,
      };
    }

    return {
      label: `in ${formatDaysHours(deltaMs)}`,
      tone: "neutral",
      isPast: false,
    };
  }

  if (abs < MINUTE_MS) {
    return { label: "due", tone: "danger", isPast: true };
  }

  return {
    label: `${formatElapsed(abs)} ago`,
    tone: "danger",
    isPast: true,
  };
}

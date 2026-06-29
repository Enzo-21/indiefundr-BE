export type AutopilotCountdownTone = "success" | "skipped";

export function autopilotCountdownToneClasses(tone: AutopilotCountdownTone) {
  return tone === "success"
    ? {
        container: "border-emerald-500/40 bg-emerald-500/10",
        title: "text-emerald-900 dark:text-emerald-100",
        body: "text-emerald-800/90 dark:text-emerald-200/90",
      }
    : {
        container: "border-amber-500/40 bg-amber-500/10",
        title: "text-amber-900 dark:text-amber-100",
        body: "text-amber-800/90 dark:text-amber-200/90",
      };
}

"use client";

import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function AdminThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Sun
          className={`size-4 shrink-0 ${isDark ? "text-muted-foreground" : "text-foreground"}`}
          aria-hidden
        />
        <Label htmlFor="admin-theme-switch" className="text-sm font-normal">
          {mounted ? (isDark ? "Dark mode" : "Light mode") : "Theme"}
        </Label>
        <MoonStar
          className={`size-4 shrink-0 ${isDark ? "text-foreground" : "text-muted-foreground"}`}
          aria-hidden
        />
      </div>
      <Switch
        id="admin-theme-switch"
        checked={mounted ? isDark : false}
        disabled={!mounted}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label="Toggle dark mode"
      />
    </div>
  );
}

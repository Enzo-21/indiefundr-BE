"use client";

import { MoonStar, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { SecondarySwipeButton } from "@/components/swipe-buttons";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

const toggleClassName = "relative size-9 shrink-0 p-0";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return (
      <SecondarySwipeButton className={toggleClassName} aria-label="Toggle theme">
        <MoonStar className="size-5" />
      </SecondarySwipeButton>
    );
  }

  return (
    <SecondarySwipeButton
      className={toggleClassName}
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <MoonStar className="size-5 scale-100 transition-all dark:scale-0" />
      <Sun className="absolute size-5 scale-0 transition-all dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </SecondarySwipeButton>
  );
}

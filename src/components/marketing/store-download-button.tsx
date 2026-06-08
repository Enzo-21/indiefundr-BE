"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type StoreVariant = "apple" | "google";

const storeConfig = {
  apple: {
    icon: "/images/apple-icon.webp",
    alt: "App Store",
    topLine: "Download on the",
    bottomLine: "App Store",
    invertIcon: true,
  },
  google: {
    icon: "/images/google-play-icon.webp",
    alt: "Google Play",
    topLine: "Get it on",
    bottomLine: "Google Play",
    invertIcon: false,
  },
} as const;

export function StoreDownloadButton({
  variant,
  onClick,
  className,
  iconClassName,
  bottomLine,
}: {
  variant: StoreVariant;
  onClick: () => void;
  className?: string;
  iconClassName?: string;
  bottomLine?: string;
}) {
  const config = storeConfig[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-50 items-center gap-4 rounded-lg bg-black px-5 py-1.75 text-white dark:bg-white dark:text-black",
        className
      )}
    >
      <Image
        src={config.icon}
        alt={config.alt}
        width={34}
        height={34}
        className={cn(
          "h-auto w-auto shrink-0",
          config.invertIcon && "invert dark:invert-0",
          iconClassName
        )}
      />
      <div className="flex flex-col items-start">
        <p className="text-xs leading-4">{config.topLine}</p>
        <p className="text-base leading-6 font-medium opacity-90">
          {bottomLine ?? config.bottomLine}
        </p>
      </div>
    </button>
  );
}

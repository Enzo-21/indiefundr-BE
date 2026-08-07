"use client";

import { useEffect, useState } from "react";
import { FooterTextHoverEffect } from "@/components/footer-text-hover-effect";
import { MARKETING_BRAND } from "@/lib/marketing/copy";

type Props = {
  title: string;
  body: string;
  /** When set, countdown then attempt to close the window. */
  autoCloseSeconds?: number;
};

export function MercadoPagoResultPage({
  title,
  body,
  autoCloseSeconds,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(autoCloseSeconds ?? null);
  const [closeAttempted, setCloseAttempted] = useState(false);

  useEffect(() => {
    if (autoCloseSeconds == null || autoCloseSeconds <= 0) return;

    setSecondsLeft(autoCloseSeconds);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const left = Math.max(0, Math.ceil(autoCloseSeconds - elapsed));
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(tick);
        setCloseAttempted(true);
        window.close();
      }
    }, 100);

    return () => window.clearInterval(tick);
  }, [autoCloseSeconds]);

  const showCountdown = autoCloseSeconds != null && autoCloseSeconds > 0;
  const progress =
    showCountdown && secondsLeft != null
      ? 1 - secondsLeft / autoCloseSeconds
      : 0;

  return (
    <div className="bg-background text-foreground flex min-h-dvh w-full flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">{body}</p>

        {showCountdown ? (
          <div className="mt-2 flex w-full max-w-sm flex-col items-center gap-3">
            <div
              className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={autoCloseSeconds}
              aria-valuenow={
                secondsLeft == null
                  ? 0
                  : autoCloseSeconds - secondsLeft
              }
              aria-label="Closing soon"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-100 ease-linear"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
            <p className="text-muted-foreground text-sm">
              {closeAttempted
                ? "You can close this window now."
                : `This page will close automatically in ${secondsLeft ?? autoCloseSeconds}s`}
            </p>
          </div>
        ) : null}
      </main>

      <div className="pointer-events-none w-full px-4 pb-6 sm:px-10 md:px-16">
        <FooterTextHoverEffect text={MARKETING_BRAND} />
      </div>
    </div>
  );
}

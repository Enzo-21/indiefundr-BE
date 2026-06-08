"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronUp, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Marquee } from "@/components/marquee";
import { MotionPreset } from "@/components/motion-preset";
import { PrimarySwipeButton, SecondarySwipeButton } from "@/components/swipe-buttons";
import { heroStats, heroContent } from "@/lib/content";
import { cn } from "@/lib/utils";

const floatClasses = [
  "animate-hero-float-1",
  "animate-hero-float-2",
  "animate-hero-float-3",
  "animate-hero-float-4",
];

function FloatingCard({
  className,
  floatIndex,
  children,
}: {
  className: string;
  floatIndex: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={cn(
        "bg-card absolute max-lg:hidden",
        !reduceMotion && floatClasses[floatIndex],
        className
      )}
    >
      {children}
    </div>
  );
}

export function HeroSection({
  requestHost,
}: {
  requestHost?: string | null;
}) {
  const [statIndex, setStatIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setStatIndex((prev) => (prev + 1) % heroStats.length);
    }, 3600);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  return (
    <section className="relative -mt-20 overflow-hidden bg-[url(/images/bg-pattern.webp)] pt-28 sm:pt-36 lg:pt-44">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 px-4 sm:gap-16 sm:px-6 lg:gap-24 lg:px-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <MotionPreset fade delay={0}>
            <span className="flex items-center gap-2 px-2 py-0.5">
              <span className="size-2.5 rounded-xs bg-yellow-500" />
              <span className="inline-flex text-sm font-medium">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={statIndex}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    {heroStats[statIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </span>
          </MotionPreset>

          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.2}>
            <h1 className="text-2xl font-semibold sm:text-3xl lg:text-6xl">
              {heroContent.title}
            </h1>
          </MotionPreset>

          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.4}>
            <p className="text-muted-foreground max-w-4xl text-xl">
              {heroContent.subtitle}
            </p>
          </MotionPreset>

          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.6}>
            <div className="flex flex-wrap items-center gap-4">
              <PrimarySwipeButton requestHost={requestHost}>
                {heroContent.primaryCta}
              </PrimarySwipeButton>
              <SecondarySwipeButton href={heroContent.secondaryHref}>
                {heroContent.secondaryCta}
              </SecondarySwipeButton>
            </div>
          </MotionPreset>
        </div>

        <div className="relative flex w-full items-end justify-center pt-19">
          <FloatingCard
            floatIndex={0}
            className="top-[3.5%] left-[19%] flex -rotate-3 items-center gap-2 rounded-lg border px-3 py-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brand-logo/amazon.webp" alt="Amazon logo" className="size-4 dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brand-logo/amazon-dark.webp" alt="Amazon logo dark" className="hidden size-4 dark:inline-block" />
            <span className="font-medium">Amazon</span>
            <span className="text-muted-foreground text-xs font-light">Shopping</span>
            <span className="text-destructive ml-6 text-sm">$800</span>
          </FloatingCard>

          <FloatingCard
            floatIndex={1}
            className="top-[16.4%] left-3 flex -rotate-3 items-center gap-1.5 rounded-full px-3 py-2"
          >
            <span className="grid size-10 place-content-center rounded-full border shadow-sm">
              <svg width="25" height="25" viewBox="0 0 25 25" fill="none" className="size-5.5" aria-hidden>
                <path d="M23.75 5.46872C23.75 3.13879 21.8612 1.25 19.5312 1.25H5.46875C3.1388 1.25 1.25 3.13879 1.25 5.46873V19.5313C1.25 21.8612 3.1388 23.75 5.46875 23.75H19.5313C21.8612 23.75 23.75 21.8612 23.75 19.5313V5.46872Z" fill="var(--primary)" />
                <path d="M12.4995 7.13083V7.22664M10.7417 11.3282H13.0855L13.0859 18.3594M19.5312 1.25C21.8612 1.25 23.75 3.13879 23.75 5.46873L23.75 19.5313C23.75 21.8612 21.8612 23.75 19.5313 23.75H5.46875C3.1388 23.75 1.25 21.8612 1.25 19.5313V5.46873C1.25 3.13879 3.1388 1.25 5.46875 1.25H19.5312Z" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="flex flex-col text-left">
              <span className="font-medium">Expense limit is near 🤔</span>
              <span className="text-muted-foreground text-xs">1:20</span>
            </div>
          </FloatingCard>

          <FloatingCard
            floatIndex={2}
            className="top-[7.5%] right-[10.5%] flex rotate-3 flex-col gap-1 rounded-xl border px-3 py-4 shadow-xl"
          >
            <span className="text-muted-foreground text-sm">Total expenses in 2 month</span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-4xl font-semibold">$13k</span>
              <span className="flex h-5 items-center gap-1 rounded-full bg-green-600/10 px-1 text-green-600 dark:bg-green-400/10 dark:text-green-400">
                <span className="text-sm">+38%</span>
                <ChevronUp className="size-4" />
              </span>
            </div>
          </FloatingCard>

          <FloatingCard
            floatIndex={3}
            className="top-[21.75%] right-6 grid size-10.5 rotate-12 place-content-center rounded-full"
          >
            <Star className="size-5 fill-primary text-primary" />
          </FloatingCard>

          <div className="bg-background absolute right-1/2 bottom-0 aspect-square w-[28%] translate-x-[-78%] -rotate-2 rounded-md opacity-50 max-sm:hidden" />
          <div className="bg-background absolute bottom-0 left-1/2 aspect-square w-[28%] translate-x-[78%] rotate-2 rounded-md opacity-50 max-sm:hidden" />

          <div className="absolute right-1/2 bottom-0 w-[32.25%] translate-x-[-38%] max-sm:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/widget-left.webp" alt="Widget Left" className="w-full dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/widget-left-dark.webp" alt="Widget Left" className="hidden w-full dark:inline-block" />
          </div>
          <div className="absolute bottom-0 left-1/2 w-[32.25%] translate-x-[38%] max-sm:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/widget-right.webp" alt="Widget Right" className="w-full dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/widget-right-dark.webp" alt="Widget Right" className="hidden w-full dark:inline-block" />
          </div>

          <MotionPreset fade blur delay={0.9} className="w-full max-w-[37.5%] min-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-mobile.webp" alt="Mobile Phone" className="w-full dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-mobile-dark.webp" alt="Mobile Phone Dark" className="hidden w-full dark:inline-block" />
          </MotionPreset>
        </div>

        <div className="from-background absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent" />
      </div>

      <Marquee
        duration={50}
        gap={0}
        repeat={4}
        className="pointer-events-none absolute inset-0 -z-1 flex-row p-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/cloud-image.webp" alt="" className="inset-0 opacity-60 dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/cloud-image-dark.webp" alt="" className="inset-0 hidden opacity-40 dark:inline-block" />
      </Marquee>
    </section>
  );
}

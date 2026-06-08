"use client";

import {
  ArrowLeftRight,
  ChartLine,
  PiggyBank,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MotionPreset } from "@/components/motion-preset";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import { Badge } from "@/components/ui/badge";
import { featurePanels, featuresSection } from "@/lib/content";
import { cn } from "@/lib/utils";

const featureIcons: Record<string, LucideIcon> = {
  "tron-wallet": Wallet,
  "fund-catalog": PiggyBank,
  "usdt-subscribe": ArrowLeftRight,
  "portfolio-tracking": ChartLine,
  "usdt-withdraw": Receipt,
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(window.innerWidth < 768);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function FeatureScrollItem({
  feature,
  isMobile,
}: {
  feature: (typeof featurePanels)[number];
  isMobile: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const offset = isMobile ? 40 : 100;

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: isMobile ? ["start 0.8", "end 0.8"] : ["start end", "end start"],
  });

  const y = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [0, 0] : [-offset, offset]
  );
  const opacity = useTransform(
    scrollYProgress,
    isMobile ? [0, 0.3, 0.7, 1] : [0, 0.4, 0.5, 0.6, 1],
    isMobile ? [0, 1, 1, 0] : [0, 1, 1, 1, 0]
  );

  const Icon = featureIcons[feature.id] ?? Wallet;

  return (
    <section
      ref={ref}
      id={feature.id}
      className={
        isMobile
          ? "flex min-h-[30vh] justify-center px-4 pb-8"
          : "flex min-h-screen items-center justify-center pt-20"
      }
    >
      <motion.div
        className={
          isMobile
            ? "w-full max-w-sm space-y-2"
            : cn(
                "w-full max-w-xs space-y-2 lg:max-xl:max-w-75",
                feature.position === "left"
                  ? "mr-auto ml-8 lg:ml-0"
                  : "mr-8 ml-auto md:mr-auto md:ml-8 lg:mr-0 lg:ml-auto"
              )
        }
        style={{ opacity, y }}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "from-primary/10 to-primary/20 flex shrink-0 items-center justify-center rounded-lg border bg-linear-to-b",
              isMobile ? "size-12" : "size-15"
            )}
          >
            <Icon className="text-primary size-6" />
          </div>
          <h3 className="text-2xl font-semibold">{feature.title}</h3>
        </div>
        <p className="text-muted-foreground">{feature.description}</p>
      </motion.div>
    </section>
  );
}

export function FeaturesSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const phoneY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["0%", "-60%"]
  );

  return (
    <section id="features" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center">
          <MotionPreset fade slide={{ direction: "down", offset: 50 }} transition={{ duration: 0.7 }}>
            <Badge
              variant="outline"
              className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm uppercase [&>svg]:size-6!"
            >
              <SpinBadgeIcon />
              {featuresSection.badge}
            </Badge>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.2}
            transition={{ duration: 0.7 }}
            className="text-2xl font-semibold md:text-3xl lg:text-4xl"
          >
            <h2>{featuresSection.title}</h2>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.4}
            transition={{ duration: 0.7 }}
            className="text-muted-foreground text-xl"
          >
            <p>{featuresSection.subtitle}</p>
          </MotionPreset>
        </div>

        <MotionPreset
          fade
          slide={{ direction: "down", offset: 50 }}
          delay={0.6}
          transition={{ duration: 0.7 }}
        >
          <div ref={containerRef} className="relative">
            <div className="pointer-events-none sticky top-4 z-10 flex justify-center md:top-0 md:h-screen md:items-center md:justify-end lg:justify-center">
              <div className="relative overflow-hidden rounded-4xl md:rounded-[56px] md:max-lg:scale-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/frame.webp"
                  alt="Mobile Frame"
                  className="relative z-20 w-full max-w-52 md:max-w-83"
                />
                <motion.img
                  src="/images/perplexity.webp"
                  alt="App Content"
                  className="absolute inset-x-3 top-0 -z-10 w-full max-w-46 md:inset-x-5 md:max-w-73.75 dark:hidden"
                  style={{ y: phoneY as MotionValue<string> }}
                />
                <motion.img
                  src="/images/perplexity-dark.webp"
                  alt="App Content"
                  className="absolute inset-x-3 top-0 -z-10 hidden w-full max-w-46 md:inset-x-5 md:max-w-73.75 dark:inline-block"
                  style={{ y: phoneY as MotionValue<string> }}
                />
              </div>
            </div>

            <div className="relative max-md:mt-[55vh] md:mt-[-100vh]">
              {featurePanels.map((feature) => (
                <FeatureScrollItem key={feature.id} feature={feature} isMobile={isMobile} />
              ))}
            </div>
          </div>
        </MotionPreset>
      </div>
    </section>
  );
}

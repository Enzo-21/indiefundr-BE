"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { quoteParts } from "@/lib/content";

type QuotePart = (typeof quoteParts)[number];

function flattenQuoteParts(parts: QuotePart[]) {
  const items: Array<string | QuotePart> = [];
  for (const part of parts) {
    if (typeof part === "string") {
      part.split(" ").forEach((word) => {
        if (word) items.push(word);
      });
    } else {
      items.push(part);
    }
  }
  return items;
}

function QuoteRevealItem({
  children,
  progress,
  range,
  reduceMotion,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  reduceMotion: boolean;
}) {
  const opacity = useTransform(progress, (latest) => {
    if (reduceMotion) return 1;
    const [start, end] = range;
    if (latest <= start) return 0;
    if (latest >= end) return 1;
    return (latest - start) / (end - start);
  });

  return (
    <span className="relative mx-1 flex items-center lg:mx-1.5">
      <span className="absolute opacity-30">{children}</span>
      <motion.span className="text-foreground" style={{ opacity }}>
        {children}
      </motion.span>
    </span>
  );
}

export function QuoteSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const items = flattenQuoteParts(quoteParts);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
  });

  return (
    <section id="quote" ref={sectionRef} className="relative z-0 h-[200vh]">
      <div className="sticky top-0 mx-auto flex h-1/2 max-w-7xl items-center bg-transparent py-8 sm:py-16 lg:py-24">
        <div className="text-foreground flex flex-wrap justify-center px-4 text-3xl font-medium sm:px-6 sm:text-4xl lg:px-8 lg:text-5xl lg:leading-[1.29167] xl:text-6xl xl:leading-[1.21667]">
          {items.map((item, index) => {
            const range: [number, number] = [index / items.length, (index + 1) / items.length];
            const content =
              typeof item === "string" ? (
                item
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-9 rounded-full sm:h-10 lg:h-15 xl:h-18"
                />
              );

            return (
              <QuoteRevealItem
                key={`${typeof item === "string" ? item : item.src}-${index}`}
                progress={scrollYProgress}
                range={range}
                reduceMotion={!!reduceMotion}
              >
                {content}
              </QuoteRevealItem>
            );
          })}
        </div>
      </div>
    </section>
  );
}

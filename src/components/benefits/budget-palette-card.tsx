"use client";

import { motion } from "framer-motion";
import { MoveDownLeft, MoveUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { NumberTicker } from "@/components/benefits/number-ticker";
import { OrbitingCircles } from "@/components/benefits/orbiting-circles";
import { MotionPreset } from "@/components/motion-preset";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  benefits,
  budgetCarouselTransactions,
  budgetCategories,
  budgetInitialBalance,
} from "@/lib/content";
import { cn } from "@/lib/utils";

export function BudgetPaletteCard() {
  const [leftApi, setLeftApi] = useState<CarouselApi>();
  const [rightApi, setRightApi] = useState<CarouselApi>();
  const [balance, setBalance] = useState(budgetInitialBalance);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFirstRun, setIsFirstRun] = useState(true);

  useEffect(() => {
    if (!leftApi) return;
    const interval = setInterval(() => leftApi.scrollPrev(), 3000);
    const onSelect = () => {
      setActiveIndex(leftApi.selectedScrollSnap() + 1);
    };
    leftApi.on("select", onSelect);
    return () => {
      clearInterval(interval);
      leftApi.off("select", onSelect);
    };
  }, [leftApi]);

  useEffect(() => {
    if (!rightApi) return;
    const interval = setInterval(() => rightApi.scrollPrev(), 3000);
    return () => clearInterval(interval);
  }, [rightApi]);

  useEffect(() => {
    if (isFirstRun) {
      setIsFirstRun(false);
      return;
    }
    const tx = budgetCarouselTransactions[activeIndex % budgetCarouselTransactions.length];
    setBalance((prev) => (tx.type === "credit" ? prev + tx.amount : prev - tx.amount));
  }, [activeIndex, isFirstRun]);

  const currentTx = budgetCarouselTransactions[activeIndex % budgetCarouselTransactions.length];
  const orbitCategories = Array.from({ length: 3 }, () => budgetCategories).flat();

  return (
    <Card className="group/palette bg-muted h-full py-6 shadow-none ring-0 lg:col-span-2">
      <MotionPreset
        fade
        blur
        slide={{ direction: "down", offset: 15 }}
        delay={0.15}
        transition={{ duration: 0.5 }}
        className="relative flex h-87.5 items-center justify-center overflow-hidden"
      >
        <div className="flex w-full flex-col items-center justify-center gap-7">
          <div className="relative z-2 flex w-full items-center">
            <div className="bg-border absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2" />
            <div className="from-muted pointer-events-none absolute top-1/2 left-0 h-1 w-[calc(50%-72px)] -translate-y-1/2 bg-linear-to-r to-transparent lg:w-[calc(50%-80px)]" />
            <div className="from-muted pointer-events-none absolute top-1/2 right-0 h-1 w-[calc(50%-72px)] -translate-y-1/2 bg-linear-to-l to-transparent lg:w-[calc(50%-80px)]" />

            <Carousel
              setApi={setLeftApi}
              opts={{ align: "end", watchDrag: false, loop: true }}
              className="w-[calc(50%-72px)] lg:w-[calc(50%-80px)]"
            >
              <CarouselContent className="ml-4 py-4">
                {budgetCarouselTransactions.map((tx) => (
                  <CarouselItem
                    key={tx.id}
                    className="pr-4 pl-0 sm:max-md:basis-1/2 xl:basis-1/2"
                  >
                    <span
                      className={cn(
                        "bg-card flex items-center justify-center gap-1 rounded-full px-3 py-2 text-sm shadow-xl",
                        tx.type === "debit"
                          ? "text-destructive"
                          : "text-green-600 dark:text-green-400"
                      )}
                    >
                      {tx.type === "debit" ? (
                        <MoveDownLeft className="size-3.5 shrink-0" />
                      ) : (
                        <MoveUpRight className="size-3.5 shrink-0" />
                      )}
                      ${tx.amount}
                    </span>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            <div className="bg-background relative flex w-36 shrink-0 flex-col items-center rounded-xl border px-4.5 py-4 lg:w-40">
              <span className="text-muted-foreground text-sm lg:text-base">Current balance</span>
              <span className="text-xl font-semibold lg:text-2xl">
                $<NumberTicker value={balance} delay={0.2} />
              </span>
              <span className="bg-border absolute top-1/2 left-0 -z-1 size-1.5 -translate-x-1 -translate-y-1/2 rounded-full" />
              <span className="bg-border absolute top-1/2 right-0 -z-1 size-1.5 translate-x-1 -translate-y-1/2 rounded-full" />
            </div>

            <Carousel
              setApi={setRightApi}
              opts={{ align: "start", watchDrag: false, loop: true, startIndex: 2 }}
              className="w-[calc(50%-72px)] lg:w-[calc(50%-80px)]"
            >
              <CarouselContent className="mr-4 ml-0 py-4">
                {budgetCarouselTransactions.map((tx) => (
                  <CarouselItem
                    key={`right-${tx.id}`}
                    className="sm:max-md:basis-1/2 xl:basis-1/2"
                  >
                    <span
                      className={cn(
                        "bg-card flex items-center justify-center gap-1 rounded-full px-3 py-2 text-sm shadow-xl",
                        tx.type === "debit"
                          ? "text-destructive"
                          : "text-green-600 dark:text-green-400"
                      )}
                    >
                      {tx.type === "debit" ? (
                        <MoveDownLeft className="size-3.5 shrink-0" />
                      ) : (
                        <MoveUpRight className="size-3.5 shrink-0" />
                      )}
                      ${tx.amount}
                    </span>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>

          <motion.div
            animate={{ rotateX: [-4, 4, -4], rotateZ: [-4, 4, -4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-1 flex w-40 origin-top justify-center"
          >
            <div className="bg-border absolute bottom-0 left-7.5 h-20 w-0.5 -translate-y-24">
              <span className="bg-border absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 translate-y-full rounded-full" />
            </div>
            <div className="bg-border absolute right-7.5 bottom-0 h-20 w-0.5 -translate-y-24">
              <span className="bg-border absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 translate-y-full rounded-full" />
            </div>
            <div className="bg-card relative z-1 grid size-30 place-content-center rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/happy.webp"
                alt="Happy Face"
                className={cn(
                  "absolute top-1/2 left-1/2 size-22.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-350 ease-in-out",
                  currentTx.type === "debit" && "rotate-y-180 opacity-0!"
                )}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/sad.webp"
                alt="Sad Face"
                className={cn(
                  "absolute top-1/2 left-1/2 size-22.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-350 ease-in-out",
                  currentTx.type === "credit" && "rotate-y-180 opacity-0!"
                )}
              />
            </div>
          </motion.div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-30 items-start justify-center">
          <div className="relative flex size-200 flex-col items-center justify-center">
            <OrbitingCircles duration={54} radius={400} path={false} className="animate-orbiting">
              {orbitCategories.map((category, index) => (
                <span
                  key={`${category}-${index}`}
                  className="bg-card text-muted-foreground flex min-w-25 justify-center rounded-full px-3 py-2 text-xs font-light shadow-xl"
                >
                  {category}
                </span>
              ))}
            </OrbitingCircles>
          </div>
          <div className="from-muted pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t to-transparent" />
        </div>
      </MotionPreset>

      <CardContent className="flex flex-col gap-4 px-6 md:items-center">
        <MotionPreset
          fade
          blur
          slide={{ direction: "down", offset: 15 }}
          delay={0.3}
          transition={{ duration: 0.5 }}
          className="text-xl font-semibold md:text-center md:text-2xl"
        >
          <h3>{benefits[0].title}</h3>
        </MotionPreset>
        <MotionPreset
          fade
          blur
          slide={{ direction: "down", offset: 15 }}
          delay={0.45}
          transition={{ duration: 0.5 }}
          className="text-muted-foreground text-base md:text-center md:text-lg"
        >
          <p>{benefits[0].description}</p>
        </MotionPreset>
      </CardContent>
    </Card>
  );
}

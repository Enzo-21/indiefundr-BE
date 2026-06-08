"use client";

import { BudgetPaletteCard } from "@/components/benefits/budget-palette-card";
import { CurrencyExchangeCard } from "@/components/benefits/currency-exchange-card";
import { TransactionMarqueesCard } from "@/components/benefits/transaction-marquees-card";
import { MotionPreset } from "@/components/motion-preset";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { benefits, benefitsSection } from "@/lib/content";

export function BenefitsSection() {
  return (
    <section id="benefits" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center sm:mb-16 lg:mb-24">
          <MotionPreset fade slide={{ direction: "down", offset: 50 }} transition={{ duration: 0.7 }}>
            <Badge
              variant="outline"
              className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm uppercase [&>svg]:size-6!"
            >
              <SpinBadgeIcon />
              {benefitsSection.badge}
            </Badge>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.2}
            transition={{ duration: 0.7 }}
            className="text-2xl font-semibold md:text-3xl lg:text-4xl"
          >
            <h2>{benefitsSection.title}</h2>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.4}
            transition={{ duration: 0.7 }}
            className="text-muted-foreground text-lg md:text-xl"
          >
            <p>{benefitsSection.subtitle}</p>
          </MotionPreset>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MotionPreset fade blur slide={{ direction: "down", offset: 15 }}>
              <BudgetPaletteCard />
            </MotionPreset>
            <MotionPreset fade blur slide={{ direction: "down", offset: 15 }} delay={0.6}>
              <TransactionMarqueesCard />
            </MotionPreset>
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <MotionPreset
              fade
              blur
              slide={{ direction: "down", offset: 15 }}
              delay={1.2}
              className="min-h-140 sm:min-h-130 md:min-h-97.5 xl:col-span-3"
            >
              <Card className="group bg-muted relative h-full overflow-hidden py-6 shadow-none ring-0">
                <CardContent className="flex h-full items-center justify-between gap-6 px-6 max-md:flex-col">
                  <div className="flex flex-col gap-4 md:max-w-70.25">
                    <MotionPreset
                      fade
                      slide={{ direction: "down", offset: 15 }}
                      delay={1.35}
                      transition={{ duration: 0.5 }}
                      className="text-2xl font-semibold md:text-3xl lg:text-4xl"
                    >
                      <h3>{benefits[2].title}</h3>
                    </MotionPreset>
                    <MotionPreset
                      fade
                      blur
                      slide={{ direction: "down", offset: 15 }}
                      delay={1.5}
                      transition={{ duration: 0.5 }}
                      className="text-muted-foreground text-base md:text-lg"
                    >
                      <p>{benefits[2].description}</p>
                    </MotionPreset>
                  </div>
                  <MotionPreset
                    fade
                    blur
                    slide={{ direction: "down", offset: 15 }}
                    delay={1.65}
                    transition={{ duration: 0.5 }}
                    className="relative size-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/clean-ui-mobile.webp"
                      alt="Mobile image"
                      className="absolute -bottom-6 h-86.25 transition-transform duration-300 group-hover:scale-105 max-md:left-1/2 max-md:-translate-x-1/2 md:right-10 dark:hidden"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/clean-ui-mobile-dark.webp"
                      alt="Mobile image dark"
                      className="absolute -bottom-6 hidden h-86.25 transition-transform duration-300 group-hover:scale-105 max-md:left-1/2 max-md:-translate-x-1/2 md:right-10 dark:block"
                    />
                  </MotionPreset>
                </CardContent>
              </Card>
            </MotionPreset>

            <MotionPreset
              fade
              blur
              slide={{ direction: "down", offset: 15 }}
              delay={1.2}
              className="xl:col-span-2"
            >
              <CurrencyExchangeCard />
            </MotionPreset>
          </div>
        </div>
      </div>
    </section>
  );
}

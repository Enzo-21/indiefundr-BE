"use client";

import { Check } from "lucide-react";
import { MotionPreset } from "@/components/motion-preset";
import { PrimarySwipeButton } from "@/components/swipe-buttons";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { howItWorksSection, pricingPlans } from "@/lib/content";
import { cn } from "@/lib/utils";

export function PricingSection() {
  return (
    <section id="how-it-works" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl space-y-14 px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center">
          <MotionPreset fade slide={{ direction: "down", offset: 50 }}>
            <Badge variant="outline" className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm uppercase">
              <SpinBadgeIcon />
              {howItWorksSection.badge}
            </Badge>
          </MotionPreset>
          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.2}>
            <h2 className="text-2xl font-semibold md:text-3xl lg:text-4xl">
              {howItWorksSection.title}
            </h2>
          </MotionPreset>
          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.4}>
            <p className="text-muted-foreground text-xl">{howItWorksSection.subtitle}</p>
          </MotionPreset>
        </div>

        <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.2}>
          <div className="grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  "relative shadow-none ring-1",
                  plan.isHighlighted && "border-primary ring-primary"
                )}
              >
                {plan.isHighlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Popular</Badge>
                )}
                {plan.isLimited && (
                  <Badge variant="secondary" className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Limited availability
                  </Badge>
                )}
                <CardHeader className="space-y-2 pb-4">
                  <h3 className="text-xl font-semibold capitalize">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm">{plan.description}</p>
                  <div className="flex items-baseline gap-1 pt-2">
                    <span className="text-4xl font-semibold">{plan.priceLabel}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="text-primary size-4 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <PrimarySwipeButton className="w-full justify-center rounded-full">
                    {howItWorksSection.ctaLabel}
                  </PrimarySwipeButton>
                </CardContent>
              </Card>
            ))}
          </div>
        </MotionPreset>
      </div>
    </section>
  );
}

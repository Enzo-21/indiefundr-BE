"use client";

import { ArrowDown } from "lucide-react";
import { MotionPreset } from "@/components/motion-preset";
import { PrimarySwipeButton } from "@/components/swipe-buttons";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { faqItems, faqSection } from "@/lib/content";
import { cn } from "@/lib/utils";

export function FaqSection() {
  return (
    <section className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:gap-16 lg:grid-cols-2 lg:gap-24">
          <div className="flex flex-col justify-between">
            <div className="mb-12 space-y-4 sm:mb-16 lg:mb-24">
              <MotionPreset fade slide={{ direction: "down", offset: 50 }} transition={{ duration: 0.7 }}>
                <Badge
                  variant="outline"
                  className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm uppercase [&>svg]:size-6!"
                >
                  <SpinBadgeIcon />
                  FAQ
                </Badge>
              </MotionPreset>
              <MotionPreset
                fade
                slide={{ direction: "down", offset: 50 }}
                delay={0.2}
                transition={{ duration: 0.7 }}
                className="text-2xl font-semibold md:text-3xl lg:text-4xl"
              >
                <h2>{faqSection.title}</h2>
              </MotionPreset>
              <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.4} transition={{ duration: 0.7 }}>
                <p className="text-muted-foreground text-base leading-relaxed">
                  {faqSection.subtitle}
                </p>
              </MotionPreset>
            </div>

            <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.5} transition={{ duration: 0.7 }}>
              <Card className="shadow-lg">
                <CardContent className="space-y-6">
                  <div className="space-y-2.5">
                    <h3 className="text-xl font-medium md:text-2xl">Can&apos;t find answers?</h3>
                    <p className="text-muted-foreground text-base leading-relaxed">
                      We&apos;re here to help you out whenever you need! Get in touch with our dedicated support
                      team for personalized assistance anytime.
                    </p>
                  </div>
                  <PrimarySwipeButton className="group w-fit has-[>svg]:px-6">
                    Open the app
                  </PrimarySwipeButton>
                </CardContent>
              </Card>
            </MotionPreset>
          </div>

          <MotionPreset fade slide={{ direction: "down", offset: 50 }} delay={0.3} transition={{ duration: 0.7 }}>
            <Accordion defaultValue={["item-0"]} className="space-y-5">
              {faqItems.map((item, index) => (
                <AccordionItem
                  key={item.question}
                  value={`item-${index}`}
                  className="bg-muted group rounded-md border-0 transition-shadow duration-300 not-last:border-b-0"
                >
                  <AccordionTrigger
                    className={cn(
                      "flex flex-1 items-center justify-between gap-4 rounded-md px-5 py-4 text-left text-base font-medium transition-all outline-none hover:no-underline",
                      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      "[&>[data-slot=accordion-trigger-icon]]:hidden",
                      "[&[data-panel-open]>svg.faq-chevron]:text-primary-foreground",
                      "[&[data-panel-open]>svg.faq-chevron]:bg-primary",
                      "[&[data-panel-open]>svg.faq-chevron]:rotate-180"
                    )}
                  >
                    {item.question}
                    <ArrowDown className="faq-chevron text-primary bg-primary/10 pointer-events-none size-7 shrink-0 rounded-md p-1.5 transition-all duration-200" />
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground px-5 pb-4 text-base leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </MotionPreset>
        </div>
      </div>
    </section>
  );
}

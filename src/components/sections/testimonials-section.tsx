"use client";

import Image from "next/image";
import { Marquee } from "@/components/marquee";
import { MotionPreset } from "@/components/motion-preset";
import { Rating } from "@/components/rating";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { brandLogos, testimonials, testimonialsSection } from "@/lib/content";

function TestimonialCard({
  quote,
  name,
  handle,
  avatar,
  brand,
  rating,
}: (typeof testimonials)[number]) {
  return (
    <Card data-slot="card" className="w-96 shrink-0 shadow-none ring-1 hover:shadow-md">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Rating value={rating} />
          <div className="flex items-center gap-1.5">
            <Image src={brand.logo} alt={brand.name} width={24} height={24} className="size-6" />
            <span className="text-sm">{brand.name}</span>
          </div>
        </div>
        <p className="text-base">{quote}</p>
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-0.5">
            <h3 className="text-base font-medium">{name}</h3>
            <p className="text-muted-foreground text-base">{handle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const marqueeTestimonials = [...testimonials, ...testimonials];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="bg-muted space-y-12 py-8 sm:space-y-16 sm:py-16 lg:space-y-24 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center sm:mb-16 lg:mb-24">
          <MotionPreset fade slide={{ direction: "down", offset: 50 }} transition={{ duration: 0.7 }}>
            <Badge variant="outline" className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm uppercase">
              <SpinBadgeIcon />
              {testimonialsSection.badge}
            </Badge>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.2}
            transition={{ duration: 0.7 }}
            className="text-2xl font-semibold md:text-3xl lg:text-4xl"
          >
            <h2>{testimonialsSection.title}</h2>
          </MotionPreset>
          <MotionPreset
            fade
            slide={{ direction: "down", offset: 50 }}
            delay={0.4}
            transition={{ duration: 0.7 }}
            className="text-muted-foreground text-lg md:text-xl"
          >
            <p>{testimonialsSection.subtitle}</p>
          </MotionPreset>
        </div>

        <MotionPreset fade slide={{ direction: "down", offset: 30 }} className="mb-12 flex flex-wrap items-center justify-center gap-8">
          {brandLogos.map((logo) => (
            <div key={logo.alt} className="flex items-center gap-2 opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0">
              {logo.darkSrc ? (
                <>
                  <Image src={logo.src} alt={logo.alt} width={120} height={40} className="h-8 w-auto dark:hidden" />
                  <Image src={logo.darkSrc} alt={logo.alt} width={120} height={40} className="hidden h-8 w-auto dark:block" />
                </>
              ) : (
                <Image src={logo.src} alt={logo.alt} width={120} height={40} className="h-8 w-auto" />
              )}
            </div>
          ))}
        </MotionPreset>
      </div>

      <div className="relative">
        <div className="from-muted pointer-events-none absolute inset-y-0 left-0 z-1 w-35 bg-linear-to-r to-transparent max-sm:hidden" />
        <div className="from-muted pointer-events-none absolute inset-y-0 right-0 z-1 w-35 bg-linear-to-l to-transparent max-sm:hidden" />

        <div className="w-full overflow-hidden">
          <Marquee duration={30} gap={2} pauseOnHover className="pb-4">
            {marqueeTestimonials.map((item, index) => (
              <TestimonialCard key={`${item.name}-${index}`} {...item} />
            ))}
          </Marquee>
        </div>

        <div className="w-full overflow-hidden">
          <Marquee duration={30} gap={2} pauseOnHover reverse className="pt-4">
            {marqueeTestimonials.map((item, index) => (
              <TestimonialCard key={`rev-${item.name}-${index}`} {...item} />
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

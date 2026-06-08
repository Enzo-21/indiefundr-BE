import Image from "next/image";
import { MotionPreset } from "@/components/motion-preset";
import { StoreDownloadBadges } from "@/components/marketing/store-download-badges";
import { SpinBadgeIcon } from "@/components/swipe-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ctaSection } from "@/lib/content";

export function CtaSection({
  requestHost,
}: {
  requestHost?: string | null;
}) {

  return (
    <section id="cta" className="bg-muted scroll-mt-20 py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <MotionPreset fade blur slide={{ direction: "down" }} delay={0.6}>
          <Card className="group overflow-hidden rounded-4xl pt-8 pb-0 shadow-none ring-0 md:pt-16">
            <CardContent className="flex gap-16 px-6 max-xl:flex-col max-lg:text-center md:px-20">
              <div className="flex-1 space-y-4 md:pb-16">
                <Badge variant="outline" className="border-primary text-primary h-auto gap-2 px-3 py-1 text-sm">
                  <SpinBadgeIcon />
                  {ctaSection.badge}
                </Badge>
                <h2 className="text-2xl font-semibold md:text-3xl lg:text-4xl">
                  {ctaSection.title}
                </h2>
                <p className="text-muted-foreground mb-8 text-xl">{ctaSection.subtitle}</p>
                <StoreDownloadBadges
                  requestHost={requestHost}
                  className="gap-6 max-lg:justify-center max-md:w-full max-md:flex-col"
                  iconClassName="size-8.5"
                  appleLabel={ctaSection.appStore}
                  googleLabel={ctaSection.playStore}
                  showDesktopBrowserCta
                  orLabel={ctaSection.orLabel}
                  desktopBrowserLabel={ctaSection.desktopBrowser}
                />
              </div>
              <div className="flex flex-1 items-end justify-center">
                <Image
                  src="/images/cta-mobile.webp"
                  alt="IndieFundr app interface"
                  width={400}
                  height={500}
                  className="h-auto w-full max-w-full transition-transform duration-300 group-hover:scale-105 md:max-xl:w-100 dark:hidden"
                />
                <Image
                  src="/images/cta-mobile-dark.webp"
                  alt="IndieFundr app interface"
                  width={400}
                  height={500}
                  className="hidden h-auto w-full max-w-full transition-transform duration-300 group-hover:scale-105 md:max-xl:w-100 dark:block"
                />
              </div>
            </CardContent>
          </Card>
        </MotionPreset>
      </div>
    </section>
  );
}

import { headers } from "next/headers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { MarketingContentProvider } from "@/components/marketing/marketing-content-provider";
import { BenefitsSection } from "@/components/sections/benefits-section";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { HeroSection } from "@/components/sections/hero-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { QuoteSection } from "@/components/sections/quote-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { buildSiteContent } from "@/lib/content";
import { getAppOpenUrl } from "@/lib/marketing/appUrl";

export default async function MarketingHomePage() {
  const requestHost = (await headers()).get("host");
  const appUrl = getAppOpenUrl({ host: requestHost });
  const content = buildSiteContent();

  return (
    <MarketingContentProvider content={content}>
      <div className="flex h-full w-full min-w-0 flex-col">
        <Header />
        <main className="flex flex-1 flex-col *:scroll-mt-20">
          <HeroSection />
          <FeaturesSection />
          <BenefitsSection />
          <QuoteSection />
          <TestimonialsSection />
          <PricingSection />
          <FaqSection />
          <CtaSection appUrl={appUrl} />
        </main>
        <Footer />
      </div>
    </MarketingContentProvider>
  );
}

import { headers } from "next/headers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { BenefitsSection } from "@/components/sections/benefits-section";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { HeroSection } from "@/components/sections/hero-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { QuoteSection } from "@/components/sections/quote-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";

export default async function MarketingHomePage() {
  const requestHost = (await headers()).get("host");

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <Header />
      <main className="flex flex-1 flex-col *:scroll-mt-20">
        <HeroSection requestHost={requestHost} />
        <FeaturesSection />
        <BenefitsSection />
        <QuoteSection />
        <TestimonialsSection />
        <PricingSection />
        <FaqSection />
        <CtaSection requestHost={requestHost} />
      </main>
      <Footer requestHost={requestHost} />
    </div>
  );
}

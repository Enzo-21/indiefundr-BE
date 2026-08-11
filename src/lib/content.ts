import {
  buildMarketingCopy,
  heroDecorCopy,
  MARKETING_BRAND,
} from "@/lib/marketing/copy";
import {
  formatInvestmentTermHyphenated,
  formatInvestmentTermLabel,
  getInvestmentTermApproxDays,
} from "@/lib/config/investmentTiming";

const featureIds = [
  "tron-wallet",
  "fund-catalog",
  "usdt-subscribe",
  "portfolio-tracking",
  "usdt-withdraw",
];

const testimonialBrands = [
  { name: "twitter", logo: "/images/brand-logo/twitter.webp" },
  { name: "Trustpilot", logo: "/images/brand-logo/trustpilot.webp" },
  { name: "reddit", logo: "/images/brand-logo/reddit.webp" },
];

export type SiteContent = ReturnType<typeof buildSiteContent>;

export function buildSiteContent() {
  const copy = buildMarketingCopy();
  const {
    heroCopy,
    featuresCopy,
    benefitsCopy,
    testimonialsCopy,
    howItWorksCopy,
    faqCopy,
    ctaCopy,
    footerCopy,
    investmentTermDays,
    investmentTermLabel,
    investmentTermHyphenated,
  } = copy;

  const siteConfig = {
    name: MARKETING_BRAND,
    title: `IndieFundr — Multiply your money in ${investmentTermLabel}`,
    description: `Put your money to work in five studied, unconventional ${investmentTermHyphenated} funds with illustrative targets from 6% to 40%. Start from $50. Fund and withdraw globally with USDT.`,
    keywords: [
      "invest money",
      "multiply money",
      "unconventional investing",
      `${investmentTermDays} day investment`,
      "high yield funds",
      "mobile investing",
      "IndieFundr",
      "passive returns",
      "alternative investments",
      "fund investing from $50",
    ],
    url: "https://indiefundr.com",
  };

  const heroStats = [
    "From $50 per fund",
    `Five studied, ${investmentTermHyphenated} funds`,
    `Targets up to 40% in ${investmentTermLabel}`,
    "Beyond traditional investing",
    "Unconventional strategies, vetted funds",
  ];

  const heroContent = {
    title: heroCopy.title,
    subtitle: heroCopy.subtitle,
    primaryCta: heroCopy.primaryCta,
    secondaryCta: heroCopy.secondaryCta,
    secondaryHref: "#how-it-works",
  };

  const navigationData = [
    {
      title: "Features",
      href: "/#features",
      items: featuresCopy.items.slice(0, 3).map((item, index) => ({
        title: item.title,
        href: `/#${featureIds[index]}`,
        description: item.description,
      })),
      imageSection: {
        title: featuresCopy.items[3]?.title ?? "Portfolio tracking",
        href: `/#${featureIds[3]}`,
        description: featuresCopy.items[3]?.description ?? "",
      },
    },
    { title: "Benefits", href: "/#benefits" },
    { title: "Testimonials", href: "/#testimonials" },
    { title: "How it works", href: "/#how-it-works" },
    { title: "Blog", href: "/blog" },
  ];

  const featurePanels = featuresCopy.items.map((item, index) => ({
    id: featureIds[index] ?? `feature-${index}`,
    title: item.title,
    description: item.description,
    position: (index % 2 === 0 ? "left" : "right") as "left" | "right",
  }));

  const benefits = benefitsCopy.items;

  const testimonials = testimonialsCopy.items.map((item, index) => ({
    quote: item.quote,
    name: item.name,
    handle: item.handle,
    avatar: `/images/avatar/${(index % 6) + 1}.webp`,
    brand: testimonialBrands[index % testimonialBrands.length],
    rating: index === 0 ? 5 : 4.5,
  }));

  const pricingPlans = howItWorksCopy.steps.map((step) => ({
    step: step.step,
    name: step.name,
    description: step.description,
    features: step.highlights,
  }));

  const howItWorksSection = {
    badge: "How it works",
    title: howItWorksCopy.title,
    subtitle: howItWorksCopy.subtitle,
  };

  const faqItems = faqCopy.items;

  const faqSection = {
    title: faqCopy.title,
    subtitle: faqCopy.subtitle,
    supportCard: faqCopy.supportCard,
  };

  const navCta = heroCopy.navCta;

  const ctaSection = {
    badge: "Try now",
    title: ctaCopy.title,
    subtitle: ctaCopy.subtitle,
    appStore: ctaCopy.appStore,
    playStore: ctaCopy.playStore,
    orLabel: ctaCopy.orLabel,
    desktopBrowser: ctaCopy.desktopBrowser,
  };

  const footerLinks = {
    product: [
      { label: "Blog", href: "/blog" },
      ...footerCopy.company.map((link) => ({
        label: link.label,
        href: link.href.startsWith("#") ? `/${link.href}` : link.href,
      })),
    ],
  };

  const featuresSection = {
    badge: "Features",
    title: featuresCopy.title,
    subtitle: featuresCopy.subtitle,
  };

  const benefitsSection = {
    badge: "Benefits",
    title: benefitsCopy.title,
    subtitle: benefitsCopy.subtitle,
  };

  const testimonialsSection = {
    badge: "testimonials",
    title: testimonialsCopy.title,
    subtitle: testimonialsCopy.subtitle,
  };

  return {
    siteConfig,
    heroStats,
    heroContent,
    navigationData,
    featurePanels,
    benefits,
    testimonials,
    pricingPlans,
    howItWorksSection,
    faqItems,
    faqSection,
    navCta,
    ctaSection,
    footerLinks,
    footerShareLine: footerCopy.shareLine,
    footerShareHint: footerCopy.shareHint,
    footerTagline: footerCopy.tagline,
    featuresSection,
    benefitsSection,
    testimonialsSection,
  };
}

/** Server-only helper for metadata and non-marketing consumers. */
export function buildSiteConfig() {
  const investmentTermDays = getInvestmentTermApproxDays();
  const investmentTermLabel = formatInvestmentTermLabel(investmentTermDays);
  const investmentTermHyphenated =
    formatInvestmentTermHyphenated(investmentTermDays);

  return {
    name: MARKETING_BRAND,
    title: `IndieFundr — Multiply your money in ${investmentTermLabel}`,
    description: `Put your money to work in five studied, unconventional ${investmentTermHyphenated} funds with illustrative targets from 6% to 40%. Start from $50. Fund and withdraw globally with USDT.`,
    keywords: [
      "invest money",
      "multiply money",
      "unconventional investing",
      `${investmentTermDays} day investment`,
      "high yield funds",
      "mobile investing",
      "IndieFundr",
      "passive returns",
      "alternative investments",
      "fund investing from $50",
    ],
    url: "https://indiefundr.com",
  };
}

export { heroDecorCopy };

export const budgetInitialBalance = 0;

export const budgetCarouselTransactions = [
  { id: "1", amount: 68, type: "credit" as const },
  { id: "2", amount: 37, type: "debit" as const },
  { id: "3", amount: 43, type: "debit" as const },
  { id: "4", amount: 62, type: "credit" as const },
  { id: "5", amount: 50, type: "debit" as const },
];

export const budgetCategories = [
  "Conservative",
  "Balanced",
  "Growth",
  "Income",
  "Stable",
  "Reserve",
];

export type BenefitTransactionIcon =
  | "shopping-cart"
  | "circle-dollar-sign"
  | "coffee"
  | "chart-spline"
  | "bus"
  | "hand-coins"
  | "house"
  | "plane"
  | "repeat"
  | "more-horizontal"
  | "credit-card";

export const benefitMarqueeRows = [
  {
    reverse: false,
    transactions: [
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: false, icon: "chart-spline" as const },
      { title: "Payout claim", amount: 2750, difference: 250, type: "credit" as const, isBordered: true, icon: "hand-coins" as const },
      { title: "Deposit", amount: 5000, difference: 500, type: "credit" as const, isBordered: false, icon: "circle-dollar-sign" as const },
      { title: "Withdrawal", amount: 1200, difference: 120, type: "debit" as const, isBordered: true, icon: "credit-card" as const },
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: false, icon: "chart-spline" as const },
      { title: "Portfolio sync", amount: 0, difference: 0, type: "credit" as const, isBordered: true, icon: "repeat" as const },
      { title: "Deposit", amount: 1000, difference: 100, type: "credit" as const, isBordered: true, icon: "circle-dollar-sign" as const },
    ],
  },
  {
    reverse: true,
    transactions: [
      { title: "Payout claim", amount: 2750, difference: 250, type: "credit" as const, isBordered: true, icon: "hand-coins" as const },
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: false, icon: "chart-spline" as const },
      { title: "Withdrawal", amount: 800, difference: 80, type: "debit" as const, isBordered: true, icon: "credit-card" as const },
      { title: "Deposit", amount: 3000, difference: 300, type: "credit" as const, isBordered: false, icon: "circle-dollar-sign" as const },
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: true, icon: "chart-spline" as const },
      { title: "Withdrawal", amount: 500, difference: 50, type: "debit" as const, isBordered: false, icon: "credit-card" as const },
      { title: "Other", amount: 100, difference: 10, type: "debit" as const, isBordered: true, icon: "more-horizontal" as const },
    ],
  },
  {
    reverse: false,
    transactions: [
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: false, icon: "chart-spline" as const },
      { title: "Deposit", amount: 5000, difference: 500, type: "credit" as const, isBordered: true, icon: "circle-dollar-sign" as const },
      { title: "Payout claim", amount: 2750, difference: 250, type: "credit" as const, isBordered: false, icon: "hand-coins" as const },
      { title: "Withdrawal", amount: 1200, difference: 120, type: "debit" as const, isBordered: true, icon: "credit-card" as const },
      { title: "Fund subscribe", amount: 2500, difference: 120, type: "debit" as const, isBordered: false, icon: "chart-spline" as const },
      { title: "Portfolio sync", amount: 0, difference: 0, type: "credit" as const, isBordered: true, icon: "repeat" as const },
      { title: "Deposit", amount: 1000, difference: 100, type: "credit" as const, isBordered: true, icon: "circle-dollar-sign" as const },
    ],
  },
];

export const quoteParts = [
  "Your",
  "money",
  "in.",
  "Returns",
  "out.",
  "Every",
  "move",
  { type: "image" as const, src: "/images/quote-image-1.webp", alt: "Investor avatar 1" },
  "verified.",
  { type: "image" as const, src: "/images/quote-image-2.webp", alt: "Investor avatar 2" },
];

export const brandLogos = [
  { src: "/images/brand-logo/amazon.webp", darkSrc: "/images/brand-logo/amazon-dark.webp", alt: "Global investing" },
  { src: "/images/brand-logo/twitter.webp", alt: "Returns" },
  { src: "/images/brand-logo/trustpilot.webp", alt: "Portfolio" },
  { src: "/images/brand-logo/reddit.webp", alt: "IndieFundr" },
];

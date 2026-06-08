export const MARKETING_BRAND = "IndieFundr";

export const marketingNav = [
  { label: "Features", href: "#features" },
  { label: "Benefits", href: "#benefits" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
] as const;

export const heroCopy = {
  eyebrow: "USDT investing on Tron",
  title: "Grow USDT in curated 90-day funds",
  subtitle:
    "IndieFundr gives you a Tron wallet, a catalog of risk-tiered funds, and a clear portfolio — subscribe with USDT, track on-chain activity, and withdraw when you are ready.",
  primaryCta: "Open the app",
  secondaryCta: "See how it works",
  stat: "Built for transparent on-chain investing",
};

export const featuresCopy = {
  title: "Everything you need to invest from your phone",
  subtitle:
    "From wallet creation to fund subscription and payout claims — designed for USDT on Tron.",
  items: [
    {
      title: "Tron wallet built in",
      description:
        "Register and get a main USDT wallet automatically. View balances, activity, and TronScan links in one place.",
    },
    {
      title: "Curated fund catalog",
      description:
        "Choose from multiple 90-day funds with different risk profiles and illustrative target returns.",
    },
    {
      title: "Simple USDT subscribe",
      description:
        "Invest from 25 USDT per fund. Treasury-sponsored TRX covers network fees so you mainly need USDT.",
    },
    {
      title: "Portfolio tracking",
      description:
        "See invested vs available balance, per-fund positions, maturity dates, and claim payouts when ready.",
    },
    {
      title: "Withdraw on your terms",
      description:
        "Send available USDT to any valid Tron address when your balance is not reserved by open orders.",
    },
  ],
};

export const benefitsCopy = {
  title: "Why investors use IndieFundr",
  subtitle:
    "Clarity, on-chain proof, and a mobile-first flow — without juggling exchanges and spreadsheets.",
  items: [
    {
      title: "On-chain transparency",
      description:
        "Subscriptions and payouts tie to real Tron transactions you can verify on TronScan.",
    },
    {
      title: "USDT-first experience",
      description:
        "Fund investments with USDT. Network fees are handled via treasury TRX sponsorship on subscribe.",
    },
    {
      title: "Live activity feed",
      description:
        "Pending orders, investments, redemptions, and transfers appear in your home activity list.",
    },
    {
      title: "Clean mobile UX",
      description:
        "Slide-to-confirm flows, clear validation, and portfolio breakdowns designed for small screens.",
    },
  ],
};

export const testimonialsCopy = {
  title: "Built for indie capital",
  subtitle: "Early feedback from builders testing USDT fund flows on Shasta.",
  items: [
    {
      quote:
        "I can see exactly which fund my USDT went to and when the position matures — no guessing.",
      name: "Beta tester",
      handle: "@fund_ops",
    },
    {
      quote:
        "Subscribe with USDT only was the killer feature. I did not have to hunt for TRX first.",
      name: "Mobile user",
      handle: "@shasta_user",
    },
    {
      quote:
        "Portfolio breakdown makes it obvious what is invested vs what I can still withdraw.",
      name: "Power user",
      handle: "@usdt_native",
    },
  ],
};

export const howItWorksCopy = {
  title: "How it works",
  subtitle: "Three steps from signup to payout — illustrative targets, not guarantees.",
  steps: [
    {
      name: "Create wallet",
      price: "Free",
      description:
        "Sign up with email OTP, receive a Tron main wallet, and fund it with USDT (testnet or mainnet).",
      highlights: ["Email verification", "Auto wallet", "TronScan links"],
    },
    {
      name: "Subscribe to a fund",
      price: "25 USDT",
      description:
        "Pick a fund, confirm with slide-to-submit, and track the order until the investment is active.",
      highlights: [
        "Multiple risk tiers",
        "90-day term",
        "On-chain USDT transfer",
      ],
      popular: true,
    },
    {
      name: "Claim payout",
      price: "At maturity",
      description:
        "When a position matures, claim USDT back to your wallet and withdraw to any Tron address.",
      highlights: ["Portfolio alerts", "Parallel withdrawals", "Activity history"],
    },
  ],
};

export const faqCopy = {
  title: "Frequently asked questions",
  subtitle: "Quick answers about wallets, USDT, testnet, and fund risk.",
  items: [
    {
      question: "What is IndieFundr?",
      answer:
        "IndieFundr is a mobile app for investing USDT into curated 90-day funds on the Tron network, with built-in wallet, portfolio, and withdrawal flows.",
    },
    {
      question: "Do I need TRX to invest?",
      answer:
        "For fund subscriptions, treasury fee sponsorship covers typical Tron network fees — you primarily need USDT in your main wallet. Withdrawals may require TRX depending on network conditions.",
    },
    {
      question: "Is this testnet or mainnet?",
      answer:
        "Development uses Shasta testnet by default. Production deployments use mainnet USDT — always check your environment and TronScan links in the app.",
    },
    {
      question: "Are returns guaranteed?",
      answer:
        "No. Fund cards show illustrative target returns for the 90-day term. Actual outcomes depend on fund performance and operational processes.",
    },
    {
      question: "Can I withdraw while orders are open?",
      answer:
        "Available USDT excludes amounts reserved by pending investments or withdrawals. Multiple withdrawals are allowed when remaining balance covers them.",
    },
  ],
};

export const ctaCopy = {
  title: "Ready to invest your USDT?",
  subtitle:
    "Open the IndieFundr app, fund your wallet, and explore funds in minutes.",
  primary: "Open the app",
  appStore: "App Store",
  playStore: "Google Play",
  orLabel: "OR",
  desktopBrowser: "Run on your computer",
};

export const footerCopy = {
  tagline:
    "Invest USDT in curated Tron funds with wallet, portfolio, and withdrawal tools in one mobile experience.",
  company: [
    { label: "Features", href: "#features" },
    { label: "Benefits", href: "#benefits" },
    { label: "How it works", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
  ],
  help: [
    { label: "Admin", href: "/admin/login" },
  ],
};

export const MARKETING_BRAND = "IndieFundr";

export const marketingNav = [
  { label: "Features", href: "#features" },
  { label: "Benefits", href: "#benefits" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
] as const;

export const heroCopy = {
  eyebrow: "Unconventional investing, 90 days",
  title: "What if your money actually multiplied?",
  subtitle:
    "Your cash is probably sitting idle — earning less than inflation. IndieFundr deploys it into five studied 90-day funds built on unconventional strategies, with illustrative targets from 6% to 40%. We use USDT so you can fund and withdraw from anywhere in the world.",
  primaryCta: "Start now",
  secondaryCta: "See how it works",
  navCta: "Start now",
  stat: "Built for transparent investing",
};

export const heroDecorCopy = {
  fundSubscribe: {
    fundName: "High Roller Syndicate",
    label: "Fund subscribe",
    amount: "$2,500",
  },
  maturity: {
    title: "Maturity in 47 days",
    subtitle: "2,750 payout pending",
  },
  portfolio: {
    label: "Portfolio +10%",
    amount: "+$250",
    period: "this term",
  },
};

export const featuresCopy = {
  title: "Five studied funds. One app. 90 days each.",
  subtitle:
    "We put your money to work in unconventional plays — you pick the fund, we handle the rest.",
  items: [
    {
      title: "Fund your account in minutes",
      description:
        "Sign up, add money, and you're ready to invest. No seed phrases, no bank wire delays.",
    },
    {
      title: "Pick your strategy",
      description:
        "High Roller Syndicate to Bonus & Promo Lane — five risk tiers, 6% to 40% illustrative targets.",
    },
    {
      title: "$25 in, slide to confirm",
      description:
        "Choose a fund, lock in your term, and track every dollar until maturity.",
    },
    {
      title: "See what's earning vs what's free",
      description:
        "Invested balance, maturity date, and payout status — no spreadsheet required.",
    },
    {
      title: "Withdraw when you're ready",
      description:
        "Claim your returns back to your wallet and cash out on your schedule.",
    },
  ],
};

export const benefitsCopy = {
  title: "Why your money grows faster here",
  subtitle:
    "Unconventional strategies, studied funds, and full visibility — without the friction of traditional brokers.",
  items: [
    {
      title: "Returns beyond traditional investing",
      description:
        "Our funds target 6% to 40% over 90 days through plays banks won't touch — arbitrage, syndicates, promo lanes, and more.",
    },
    {
      title: "Studied before you invest",
      description:
        "Every fund is built around a specific strategy and risk tier. You choose — we deploy.",
    },
    {
      title: "Every move is traceable",
      description:
        "Subscriptions and payouts link to verifiable transactions. No black box.",
    },
    {
      title: "Built for your phone",
      description:
        "Slide-to-confirm, clear invested vs available breakdown, maturity countdown on every position.",
    },
  ],
};

export const testimonialsCopy = {
  title: "What beta testers actually said",
  subtitle: "Early feedback from investors testing fund flows on Shasta.",
  items: [
    {
      quote:
        "I know exactly which fund got my $250 and when it matures. No guessing, no spreadsheet.",
      name: "Beta tester",
      handle: "@fund_ops",
    },
    {
      quote:
        "I put money in with one tap — didn't need to figure out crypto fees first.",
      name: "Mobile user",
      handle: "@shasta_user",
    },
    {
      quote:
        "Invested vs available is right there. I stopped worrying about what I could actually withdraw.",
      name: "Power user",
      handle: "@usdt_native",
    },
  ],
};

export const howItWorksCopy = {
  title: "How it works",
  subtitle: "From signup to payout in 3 steps — illustrative targets, never guarantees.",
  steps: [
    {
      step: 1,
      name: "Fund your account",
      description:
        "Transfer USDT on TRC20 from any wallet or exchange — Binance, Trust Wallet, OKX, Bybit, and more. Sign up with email and your account is ready in minutes.",
      highlights: [
        "Binance, Trust Wallet, OKX",
        "TRC20 network",
        "From $25 to start",
      ],
    },
    {
      step: 2,
      name: "Subscribe to a fund",
      description:
        "We invest your money for up to 90 days. Once we hit the promised return, we mark your payout ready — usually well before day 90. Most users collect early.",
      highlights: [
        "Up to 90-day term",
        "Payout ready when target is hit",
        "Most users collect early",
        "Illustrative targets up to 40%",
      ],
    },
    {
      step: 3,
      name: "Get paid — no paperwork",
      description:
        "Returns are credited straight to your wallet — no forms, no bureaucracy. Then you choose: reinvest, send to another wallet, or swap on an exchange for local currency.",
      highlights: [
        "Auto-credited to your account",
        "Reinvest in one tap",
        "Send to any wallet or exchange",
        "Swap for your local currency",
      ],
    },
  ],
};

export const faqCopy = {
  title: "Frequently asked questions",
  subtitle: "Quick answers about our funds, returns, and how funding works.",
  supportCard: {
    title: "Can't find answers?",
    description:
      "Open the app and explore five studied funds, 90-day terms, and full portfolio visibility.",
    cta: "Download the app",
  },
  items: [
    {
      question: "What is IndieFundr?",
      answer:
        "IndieFundr is a mobile app that deploys your money into five studied 90-day investment funds — unconventional strategies with illustrative targets from 6% to 40%. From $25 per fund. Built-in wallet, portfolio tracking, and withdrawals included.",
    },
    {
      question: "Why do you use USDT?",
      answer:
        "USDT is a dollar-pegged stablecoin that lets you fund and withdraw from anywhere — no bank wires, no currency conversion delays. You think in money; we handle the rails.",
    },
    {
      question: "Do I need TRX to invest?",
      answer:
        "For fund subscriptions, treasury fee sponsorship covers Tron network fees — you need funds in your wallet. Withdrawals may require TRX depending on network conditions.",
    },
    {
      question: "Is this testnet or mainnet?",
      answer:
        "Development uses Shasta testnet by default. Production deployments use mainnet USDT — always check your environment and transaction links in the app.",
    },
    {
      question: "Are returns guaranteed?",
      answer:
        "No. Fund cards show illustrative target returns for the 90-day term. Actual outcomes depend on fund performance and operational processes.",
    },
    {
      question: "Can I withdraw while orders are open?",
      answer:
        "Available balance excludes amounts reserved by pending investments or withdrawals. Multiple withdrawals are allowed when remaining balance covers them.",
    },
  ],
};

export const ctaCopy = {
  title: "Your money isn't going to multiply itself.",
  subtitle:
    "$25 minimum. Five studied funds. 90-day terms. Open the app and pick your first strategy.",
  primary: "Start now",
  appStore: "App Store",
  playStore: "Google Play",
  orLabel: "OR",
  desktopBrowser: "Run on your computer",
};

export const footerCopy = {
  tagline:
    "Deploy your money into studied, unconventional 90-day funds — from your phone.",
  shareLine: "$25 in. 90 days. Returns beyond traditional.",
  shareHint: "Know someone sitting on idle cash? Send them this.",
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

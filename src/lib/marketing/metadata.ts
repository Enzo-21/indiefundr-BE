import type { Metadata } from "next";
import { siteConfig } from "@/lib/content";

/** Placeholder until a dedicated social image is shipped. */
const OG_IMAGE_PATH = "/images/og-image.png";

export function createSiteMetadata(overrides?: Metadata): Metadata {
  const { name, title, description, url, keywords } = siteConfig;

  return {
    metadataBase: new URL(url),
    title: {
      default: title,
      template: `%s | ${name}`,
    },
    description,
    keywords,
    applicationName: name,
    authors: [{ name }],
    creator: name,
    publisher: name,
    category: "finance",
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: name,
      title,
      description,
      images: [
        {
          url: OG_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: `${name} — ${description}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE_PATH],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: url,
    },
    ...overrides,
  };
}

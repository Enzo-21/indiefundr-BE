"use client";

import Link from "next/link";
import { FooterTextHoverEffect } from "@/components/footer-text-hover-effect";
import { StoreDownloadBadges } from "@/components/marketing/store-download-badges";
import { SwipeLogoSmall } from "@/components/swipe-logo";
import { footerLinks, footerTagline, siteConfig } from "@/lib/content";

export function Footer({ requestHost }: { requestHost?: string | null }) {

  return (
    <footer className="bg-muted relative overflow-hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
        <div className="text-muted-foreground space-y-8">
          <div className="flex justify-between gap-8 max-lg:flex-col">
            <div className="space-y-3">
              <Link href="/#home" className="text-foreground block max-w-30">
                <div className="flex items-center gap-3">
                  <SwipeLogoSmall />
                  <span className="text-xl font-semibold">{siteConfig.name}</span>
                </div>
              </Link>
              <p className="max-w-xs text-sm">{footerTagline}</p>
              <StoreDownloadBadges requestHost={requestHost} />
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div className="space-y-3">
                <p className="text-foreground font-medium">Product</p>
                <ul className="space-y-2 text-sm">
                  {footerLinks.product.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="hover:text-foreground transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-foreground font-medium">Company</p>
                <ul className="space-y-2 text-sm">
                  {footerLinks.company.map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a href={link.href} className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className="hover:text-foreground transition-colors">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="-mb-10 pt-10 sm:px-16 md:-mb-22 lg:px-24">
            <FooterTextHoverEffect text={siteConfig.name} />
          </div>
        </div>
      </div>
    </footer>
  );
}

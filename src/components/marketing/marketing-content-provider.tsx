"use client";

import { createContext, useContext } from "react";
import type { SiteContent } from "@/lib/content";

const MarketingContentContext = createContext<SiteContent | null>(null);

export function MarketingContentProvider({
  content,
  children,
}: {
  content: SiteContent;
  children: React.ReactNode;
}) {
  return (
    <MarketingContentContext.Provider value={content}>
      {children}
    </MarketingContentContext.Provider>
  );
}

export function useMarketingContent(): SiteContent {
  const content = useContext(MarketingContentContext);
  if (!content) {
    throw new Error(
      "useMarketingContent must be used within MarketingContentProvider"
    );
  }
  return content;
}

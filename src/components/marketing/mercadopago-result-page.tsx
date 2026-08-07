import { MarketingContentProvider } from "@/components/marketing/marketing-content-provider";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { buildSiteContent } from "@/lib/content";

export function MercadoPagoResultPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const content = buildSiteContent();
  return (
    <MarketingContentProvider content={content}>
      <div className="flex min-h-full w-full min-w-0 flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-16 text-center sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">{body}</p>
        </main>
        <Footer />
      </div>
    </MarketingContentProvider>
  );
}

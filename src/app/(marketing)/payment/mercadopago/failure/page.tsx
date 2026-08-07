import type { Metadata } from "next";
import { MercadoPagoResultPage } from "@/components/marketing/mercadopago-result-page";
import { createSiteMetadata } from "@/lib/marketing/metadata";
import { resolveMercadoPagoFailureReturn } from "@/lib/mercadopago/returnKind";

export const metadata: Metadata = createSiteMetadata({
  title: "Payment return",
  description: "Mercado Pago payment return.",
  alternates: { canonical: "/payment/mercadopago/failure" },
});

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MercadoPagoFailurePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const kind = resolveMercadoPagoFailureReturn(params);

  if (kind === "dismiss") {
    return (
      <MercadoPagoResultPage
        title="IndieFundr"
        body="You can return to the app. This window will close automatically."
        autoCloseSeconds={2}
      />
    );
  }

  return (
    <MercadoPagoResultPage
      title="Payment could not be completed"
      body="The payment could not be completed. You can close this window and try again from the app."
    />
  );
}

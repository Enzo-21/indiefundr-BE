import type { Metadata } from "next";
import { MercadoPagoResultPage } from "@/components/marketing/mercadopago-result-page";
import { createSiteMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = createSiteMetadata({
  title: "Payment failed",
  description: "Your Mercado Pago payment could not be completed.",
  alternates: { canonical: "/payment/mercadopago/failure" },
});

export default function MercadoPagoFailurePage() {
  return (
    <MercadoPagoResultPage
      title="Payment could not be completed"
      body="The payment could not be completed. You can close this window and try again from the app."
    />
  );
}

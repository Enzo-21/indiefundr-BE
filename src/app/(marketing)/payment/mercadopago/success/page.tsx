import type { Metadata } from "next";
import { MercadoPagoResultPage } from "@/components/marketing/mercadopago-result-page";
import { createSiteMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = createSiteMetadata({
  title: "Payment successful",
  description: "Your Mercado Pago payment was successful.",
  alternates: { canonical: "/payment/mercadopago/success" },
});

export default function MercadoPagoSuccessPage() {
  return (
    <MercadoPagoResultPage
      title="Payment successful"
      body="The payment was successful. You can close this window."
    />
  );
}

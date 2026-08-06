import type { Metadata } from "next";
import { MercadoPagoResultPage } from "@/components/marketing/mercadopago-result-page";
import { createSiteMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = createSiteMetadata({
  title: "Payment pending",
  description: "Your Mercado Pago payment is pending.",
  alternates: { canonical: "/payment/mercadopago/pending" },
});

export default function MercadoPagoPendingPage() {
  return (
    <MercadoPagoResultPage
      title="Payment pending"
      body="Your payment is still pending. You can close this window — we will update your order when Mercado Pago confirms it."
    />
  );
}

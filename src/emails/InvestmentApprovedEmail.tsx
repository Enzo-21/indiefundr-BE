import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const currentYear = new Date().getFullYear();

export type InvestmentApprovedEmailProps = {
  username?: string;
  fundName?: string;
  amountUsdt?: number;
  projectedPayoutUsdt?: number;
  logoUrl?: string;
};

export function InvestmentApprovedEmail({
  username = "",
  fundName = "your fund",
  amountUsdt = 0,
  projectedPayoutUsdt = 0,
  logoUrl = "",
}: InvestmentApprovedEmailProps) {
  const amountLabel = amountUsdt.toFixed(2);
  const payoutLabel = projectedPayoutUsdt.toFixed(2);

  return (
    <Html>
      <Head />
      <Preview>Your {fundName} investment is now active</Preview>
      <Body
        style={{
          backgroundColor: "#f6f6f6",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #eaeaea",
            borderRadius: "8px",
            margin: "40px auto",
            padding: "20px",
            maxWidth: "465px",
          }}
        >
          <Section style={{ textAlign: "center", marginTop: "16px" }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                width="50"
                height="50"
                alt="IndieFundr"
                style={{ margin: "0 auto" }}
              />
            ) : null}
            <Heading
              style={{
                color: "#000000",
                fontSize: "24px",
                fontWeight: "normal",
                textAlign: "center",
                margin: "24px 0",
              }}
            >
              Investment approved
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            Congratulations — your {fundName} investment has been approved and is now
            active. We received your {amountLabel} USDT and our team is working to
            grow your money toward a projected payout of {payoutLabel} USDT.
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            Your investment receipt is attached to this email for your records. You
            can also view the position anytime in the IndieFundr app.
          </Text>
          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            You are receiving this email because your investment order was approved
            on IndieFundr.
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: "12px",
              color: "rgba(0,0,0,0.7)",
            }}
          >
            &copy; {currentYear} | IndieFundr
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvestmentApprovedEmail;

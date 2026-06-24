import {
  Body,
  Button,
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

export type InvestmentMaturedEmailProps = {
  username?: string;
  fundName?: string;
  amountUsdt?: number;
  projectedPayoutUsdt?: number;
  needsUnpaidMaturityChoice?: boolean;
  choiceHours?: number;
  portfolioUrl?: string;
  logoUrl?: string;
};

export function InvestmentMaturedEmail({
  username = "",
  fundName = "your fund",
  amountUsdt = 0,
  projectedPayoutUsdt = 0,
  needsUnpaidMaturityChoice = false,
  choiceHours = 48,
  portfolioUrl = "",
  logoUrl = "",
}: InvestmentMaturedEmailProps) {
  const amountLabel = amountUsdt.toFixed(2);
  const payoutLabel = projectedPayoutUsdt.toFixed(2);
  const preview = needsUnpaidMaturityChoice
    ? `Your ${fundName} investment reached its term — action required`
    : `Your ${fundName} investment has reached its term`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
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
              Investment term reached
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>

          {needsUnpaidMaturityChoice ? (
            <>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                Your {fundName} position ({amountLabel} USDT) has reached its maximum
                term, but we could not pay it through the normal queue yet because of
                limited liquidity in the pool.
              </Text>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                You have {choiceHours} hours to choose your next step in the app:
                wait longer for a payout attempt, or invite two friends to recover
                your {amountLabel} USDT principal. If you do not choose in time, the
                principal may be forfeited.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                Your {fundName} investment ({amountLabel} USDT) has reached its
                maximum term. Your projected payout is {payoutLabel} USDT.
              </Text>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                Our team will process eligible payouts according to fund liquidity and
                queue order. You can track the latest status anytime in your Portfolio.
              </Text>
            </>
          )}

          {portfolioUrl ? (
            <Section style={{ textAlign: "center", marginTop: "24px" }}>
              <Button
                href={portfolioUrl}
                style={{
                  backgroundColor: "#0077E6",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "bold",
                  textDecoration: "none",
                  padding: "12px 24px",
                }}
              >
                Open Portfolio
              </Button>
            </Section>
          ) : null}

          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            You are receiving this email because your investment reached its term on
            IndieFundr.
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

export default InvestmentMaturedEmail;

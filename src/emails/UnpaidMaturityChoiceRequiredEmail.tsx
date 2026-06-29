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

export type UnpaidMaturityChoiceRequiredEmailProps = {
  username?: string;
  fundName?: string;
  amountUsdt?: number;
  projectedPayoutUsdt?: number;
  choiceHours?: number;
  choiceDeadlineLabel?: string;
  portfolioUrl?: string;
  logoUrl?: string;
  isReminder?: boolean;
};

export function UnpaidMaturityChoiceRequiredEmail({
  username = "",
  fundName = "your fund",
  amountUsdt = 0,
  projectedPayoutUsdt = 0,
  choiceHours = 48,
  choiceDeadlineLabel = "",
  portfolioUrl = "",
  logoUrl = "",
  isReminder = false,
}: UnpaidMaturityChoiceRequiredEmailProps) {
  const amountLabel = amountUsdt.toFixed(2);
  const payoutLabel = projectedPayoutUsdt.toFixed(2);
  const preview = isReminder
    ? `Reminder: choose how to continue your ${fundName} investment`
    : `Action required: choose how to continue your ${fundName} investment`;

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
              {isReminder ? "Reminder: action required" : "Action required"}
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            Your {fundName} position ({amountLabel} USDT) has reached its maximum
            term, but payout is not available yet because of limited pool liquidity.
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            You have {choiceHours} hours
            {choiceDeadlineLabel ? ` (until ${choiceDeadlineLabel})` : ""} to choose
            your next step in the app:
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>1. Wait longer</strong> — extend the term for another payout
            attempt toward your projected {payoutLabel} USDT.
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>2. Invite friends</strong> — recover your {amountLabel} USDT
            principal by inviting two friends who complete their first investment.
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            If you do not choose in time, your investment may be forfeited.
          </Text>

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
                Choose in Portfolio
              </Button>
            </Section>
          ) : null}

          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            You are receiving this email because your investment reached its term and
            needs your decision on IndieFundr.
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

export default UnpaidMaturityChoiceRequiredEmail;

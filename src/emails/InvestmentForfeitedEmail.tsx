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
import type { ForfeitureReason } from "@prisma/client";

const currentYear = new Date().getFullYear();

export type InvestmentForfeitedEmailProps = {
  username?: string;
  fundName?: string;
  amountUsdt?: number;
  forfeitureReason?: ForfeitureReason;
  portfolioUrl?: string;
  logoUrl?: string;
};

function forfeitureCopy(reason: ForfeitureReason | undefined): {
  heading: string;
  body: string;
  preview: string;
} {
  switch (reason) {
    case "choice_deadline_expired":
      return {
        heading: "Investment ended — no choice made",
        preview: "Your investment term ended without a selected next step",
        body:
          "The 48-hour window to choose your next step expired without a selection. " +
          "Your investment is no longer active and no payout will be processed.",
      };
    case "second_maturity_unpaid":
      return {
        heading: "Extended term ended — no payout",
        preview: "Your extended investment term ended without payout",
        body:
          "Your extended term ended and payout was still unavailable. " +
          "There are no further payout attempts for this investment.",
      };
    case "recovery_window_expired":
      return {
        heading: "Recovery window ended",
        preview: "Your invite recovery window closed without enough qualified friends",
        body:
          "The invite recovery window closed before two friends completed their " +
          "first investments. Your principal was not recovered through this path.",
      };
    default:
      return {
        heading: "Investment forfeited",
        preview: "Your investment is no longer active",
        body: "This investment has ended and is no longer eligible for payout.",
      };
  }
}

export function InvestmentForfeitedEmail({
  username = "",
  fundName = "your fund",
  amountUsdt = 0,
  forfeitureReason,
  portfolioUrl = "",
  logoUrl = "",
}: InvestmentForfeitedEmailProps) {
  const amountLabel = amountUsdt.toFixed(2);
  const copy = forfeitureCopy(forfeitureReason);

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
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
              {copy.heading}
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            Your {fundName} investment ({amountLabel} USDT) has ended.
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            {copy.body}
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            You can review the final status in your Portfolio.
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
                Open Portfolio
              </Button>
            </Section>
          ) : null}

          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            You are receiving this email because your investment status changed on
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

export default InvestmentForfeitedEmail;

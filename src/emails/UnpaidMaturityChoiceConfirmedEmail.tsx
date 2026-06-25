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

export type UnpaidMaturityChoiceConfirmedEmailProps = {
  username?: string;
  fundName?: string;
  amountUsdt?: number;
  choice: "term_extension" | "referral_recovery";
  extensionDays?: number;
  newMaturesAt?: string;
  recoveryExpiresAt?: string;
  recoveryRequiredCount?: number;
  portfolioUrl?: string;
  logoUrl?: string;
};

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function UnpaidMaturityChoiceConfirmedEmail({
  username = "",
  fundName = "your fund",
  amountUsdt = 0,
  choice,
  extensionDays,
  newMaturesAt,
  recoveryExpiresAt,
  recoveryRequiredCount = 2,
  portfolioUrl = "",
  logoUrl = "",
}: UnpaidMaturityChoiceConfirmedEmailProps) {
  const amountLabel = amountUsdt.toFixed(2);
  const isExtension = choice === "term_extension";
  const preview = isExtension
    ? `You chose to wait longer on ${fundName}`
    : `You chose invite recovery for ${fundName}`;

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
              Choice confirmed
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>

          {isExtension ? (
            <>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                You chose to wait {extensionDays ?? ""} more days on your {fundName}{" "}
                position ({amountLabel} USDT). We will try payout again when the
                extended term ends
                {newMaturesAt ? ` on ${formatDate(newMaturesAt)}` : ""}.
              </Text>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                Track the new maturity date and status anytime in Portfolio.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                You chose to recover your {amountLabel} USDT principal on {fundName} by
                inviting {recoveryRequiredCount} friends who complete their first
                investment.
              </Text>
              <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
                {recoveryExpiresAt
                  ? `Complete invites before ${formatDate(recoveryExpiresAt)}.`
                  : "Open the app to share your invite link."}
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
            You are receiving this email because you confirmed your unpaid maturity
            choice on IndieFundr.
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

export default UnpaidMaturityChoiceConfirmedEmail;

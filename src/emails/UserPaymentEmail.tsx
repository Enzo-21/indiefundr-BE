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
import type { UserPaymentKind } from "@/services/mailing/userPaymentReceiptDocument";
import { userPaymentKindLabel } from "@/services/mailing/userPaymentReceiptDocument";

const currentYear = new Date().getFullYear();

export type UserPaymentEmailProps = {
  username?: string;
  kind: UserPaymentKind;
  amountUsdt: number;
  fundName?: string;
  principalUsdt?: number;
  earningsUsdt?: number;
  destinationAddress?: string;
  logoUrl?: string;
};

function formatUsdt(value: number): string {
  return value.toFixed(2);
}

function buildPreview(props: UserPaymentEmailProps): string {
  const amount = formatUsdt(props.amountUsdt);
  switch (props.kind) {
    case "investment_payout":
      return `You earned ${formatUsdt(props.earningsUsdt ?? 0)} USDT from ${props.fundName ?? "your investment"}`;
    case "withdrawal":
      return `Your withdrawal of ${amount} USDT has been sent`;
    case "principal_recovery":
      return `Your principal of ${amount} USDT has been recovered`;
    default:
      return `You received ${amount} USDT — ${userPaymentKindLabel(props.kind)}`;
  }
}

function buildHeading(kind: UserPaymentKind): string {
  switch (kind) {
    case "investment_payout":
      return "Congratulations — you earned!";
    case "withdrawal":
      return "Withdrawal sent";
    case "principal_recovery":
      return "Principal recovered";
    case "referral_invitee_bonus":
      return "Referral bonus received";
    case "referral_inviter_bonus":
      return "Referral reward received";
  }
}

function buildBodyCopy(props: UserPaymentEmailProps): string {
  const amount = formatUsdt(props.amountUsdt);
  const name = props.fundName ?? "your fund";

  switch (props.kind) {
    case "investment_payout": {
      const earnings = formatUsdt(props.earningsUsdt ?? 0);
      const principal = formatUsdt(props.principalUsdt ?? 0);
      return (
        `Congratulations — you earned ${earnings} USDT on your ${name} investment. ` +
        `We sent ${amount} USDT to your wallet (${principal} principal + ${earnings} earnings).`
      );
    }
    case "referral_invitee_bonus":
      return `Congratulations — you received your referral welcome bonus of ${amount} USDT.`;
    case "referral_inviter_bonus":
      return `Congratulations — you earned a referral reward of ${amount} USDT.`;
    case "principal_recovery":
      return `Your principal of ${amount} USDT has been recovered and sent to your wallet.`;
    case "withdrawal":
      return `Your withdrawal of ${amount} USDT has been sent to your wallet${
        props.destinationAddress ? ` (${props.destinationAddress})` : ""
      }.`;
  }
}

function buildFooterReason(kind: UserPaymentKind): string {
  switch (kind) {
    case "investment_payout":
      return "You are receiving this email because your investment payout was completed on IndieFundr.";
    case "withdrawal":
      return "You are receiving this email because your withdrawal was completed on IndieFundr.";
    default:
      return "You are receiving this email because a payment was completed on your IndieFundr account.";
  }
}

export function UserPaymentEmail(props: UserPaymentEmailProps) {
  const {
    username = "",
    kind,
    logoUrl = "",
  } = props;

  return (
    <Html>
      <Head />
      <Preview>{buildPreview(props)}</Preview>
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
              {buildHeading(kind)}
            </Heading>
          </Section>

          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            <strong>Hello{username ? ` ${username}` : ""}!</strong>
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            {buildBodyCopy(props)}
          </Text>
          <Text style={{ color: "#000000", fontSize: "14px", lineHeight: "24px" }}>
            Your payment receipt is attached to this email for your records. You
            can also view activity anytime in the IndieFundr app.
          </Text>
          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            {buildFooterReason(kind)}
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

export default UserPaymentEmail;

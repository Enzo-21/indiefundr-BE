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

export type OtpEmailPurpose = "verification" | "passwordReset";

const copyByPurpose: Record<
  OtpEmailPurpose,
  { preview: string; heading: string; body: string; footer: string }
> = {
  verification: {
    preview: "Verify your IndieFundr account",
    heading: "Verify your account",
    body: "Welcome to IndieFundr! Enter this code in the app to verify your account and complete sign up:",
    footer:
      "You are receiving this email because you signed up for IndieFundr. If this was not you, ignore this message.",
  },
  passwordReset: {
    preview: "Reset your IndieFundr password",
    heading: "Reset your password",
    body: "Enter this code in the app to create a new password:",
    footer:
      "You are receiving this email because a password reset was requested for your IndieFundr account. If this was not you, ignore this message.",
  },
};

const codeBoxStyle: React.CSSProperties = {
  backgroundColor: "#000000",
  color: "#ffffff",
  borderRadius: "4px",
  fontSize: "18px",
  fontWeight: "bold",
  textAlign: "center",
  padding: "12px 20px",
  display: "inline-block",
  margin: "24px 0",
};

export type OtpCodeEmailProps = {
  username?: string;
  otpCode?: string;
  purpose?: OtpEmailPurpose;
  logoUrl?: string;
};

export function OtpCodeEmail({
  username = "",
  otpCode = "",
  purpose = "verification",
  logoUrl = "",
}: OtpCodeEmailProps) {
  const copy = copyByPurpose[purpose] ?? copyByPurpose.verification;

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
            {copy.body}
          </Text>
          <Section style={{ textAlign: "center" }}>
            <Text style={codeBoxStyle}>{otpCode}</Text>
          </Section>
          <Hr style={{ borderColor: "#eaeaea", margin: "24px 0" }} />
          <Text style={{ color: "#666666", fontSize: "12px", lineHeight: "24px" }}>
            {copy.footer}
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

export default OtpCodeEmail;

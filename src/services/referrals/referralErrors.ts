export type ReferralErrorCode =
  | "INVALID_CODE"
  | "SELF_REFERRAL"
  | "ALREADY_REDEEMED"
  | "NOT_ELIGIBLE_TO_REDEEM";

export class ReferralError extends Error {
  readonly code: ReferralErrorCode;
  readonly status: number;

  constructor(code: ReferralErrorCode, message: string, status: number) {
    super(message);
    this.name = "ReferralError";
    this.code = code;
    this.status = status;
  }
}

export function toReferralResponse(error: ReferralError): Response {
  return Response.json({ code: error.code, message: error.message }, { status: error.status });
}

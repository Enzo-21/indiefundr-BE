import { z } from "zod";

const emailField = z
  .string({ required_error: "Please provide a valid email address" })
  .email("Please provide a valid email address");

export const emailBodySchema = z.object({
  email: emailField,
});

export const verifyBodySchema = z.object({
  email: emailField,
  otpCode: z
    .string({ required_error: "6 digit code is required" })
    .min(1, "6 digit code is required"),
});

export const refreshBodySchema = z.object({
  refreshToken: z
    .string({ required_error: "Refresh token is required" })
    .min(1, "Refresh token is required"),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().optional(),
});

export const deviceBodySchema = z.object({
  device: z.string().optional(),
});

"use server";

import { redirect } from "next/navigation";
import { createAdminSession, clearAdminSession } from "@/lib/auth/adminSession";
import {
  requestAdminOtp,
  verifyAdminOtp,
} from "@/services/admin/auth";

export type AdminLoginState = {
  step?: "email" | "code";
  email?: string;
  message?: string;
  error?: string;
};

export async function startAdminLogin(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const email = formData.get("email")?.toString() ?? "";
  const result = await requestAdminOtp(email);

  if (!result.ok) {
    return { step: "email", email, error: result.error };
  }

  return {
    step: "code",
    email: email.trim().toLowerCase(),
    message: result.message,
  };
}

export async function verifyAdminLogin(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const email = formData.get("email")?.toString() ?? "";
  const code = formData.get("code")?.toString() ?? "";

  const result = await verifyAdminOtp(email, code);
  if (!result.ok) {
    return {
      step: "code",
      email: email.trim().toLowerCase(),
      error: result.error,
    };
  }

  await createAdminSession({ email: result.email });
  redirect("/admin/dashboard");
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

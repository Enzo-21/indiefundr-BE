import {
  verifyAdminSession,
  type AdminSessionPayload,
} from "./adminSession";

export async function assertAdminSession(): Promise<AdminSessionPayload> {
  return verifyAdminSession();
}

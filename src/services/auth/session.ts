import { rotateRefreshToken, revokeRefreshToken } from "./tokens";

export type RefreshSessionResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { ok: false; status: number; msg: string; code?: string };

export async function refreshSession(
  refreshToken: string
): Promise<RefreshSessionResult> {
  const result = await rotateRefreshToken(refreshToken);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      msg: result.msg,
      code: result.code,
    };
  }
  return {
    ok: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

export async function logoutSession(
  refreshToken?: string
): Promise<{ ok: true }> {
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  return { ok: true };
}

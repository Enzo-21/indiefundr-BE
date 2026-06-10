import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUsernameTaken,
  validateUsernameInput,
} from "@/lib/users/username";

export type UpdateUsernameResult =
  | { ok: true; user: User }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function updateUsername(
  userId: string,
  rawUsername: string
): Promise<UpdateUsernameResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 400, body: { msg: "User not found" } };
  }

  const validation = validateUsernameInput(rawUsername);
  if (!validation.ok) {
    return { ok: false, status: 400, body: { msg: validation.msg } };
  }

  const username = validation.username;
  if (user.username === username) {
    return { ok: true, user };
  }

  if (await isUsernameTaken(username, userId)) {
    return {
      ok: false,
      status: 409,
      body: { code: "username_taken", msg: "Username already taken" },
    };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { username },
  });

  return { ok: true, user: updated };
}

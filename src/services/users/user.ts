import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serializers/user";
import { uiSnapshotLog } from "@/lib/uiSnapshotLog";
import { isValidObjectId } from "@/lib/validators/objectId";

export type UserServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: Record<string, unknown> | string };

export async function getUserById(
  id: string
): Promise<UserServiceResult<User>> {
  if (!isValidObjectId(id)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "User not found" },
    };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return {
        ok: false,
        status: 404,
        body: { msg: "User not found" },
      };
    }
    return { ok: true, data: user };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function getUserForAuth(
  userId: string
): Promise<UserServiceResult<User>> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        ok: false,
        status: 400,
        body: { msg: "Authentication error" },
      };
    }
    const serialized = serializeUser(user);
    uiSnapshotLog("auth.session", {
      userId: user.id,
      user: {
        _id: serialized._id,
        name: serialized.name,
        email: serialized.email,
        firstTime: serialized.firstTime,
      },
    });
    return { ok: true, data: user };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function welcomeUser(
  userId: string
): Promise<UserServiceResult<string>> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { firstTime: false },
    });
    if (!user) {
      return {
        ok: false,
        status: 400,
        body: { msg: "Error de usuario" },
      };
    }
    return { ok: true, data: "User has been welcomed" };
  } catch {
    return {
      ok: false,
      status: 400,
      body: { msg: "Error de usuario" },
    };
  }
}

export async function setDeviceToken(
  userId: string,
  device: string | undefined
): Promise<UserServiceResult<{ device: string | null }>> {
  if (!device) {
    return {
      ok: false,
      status: 400,
      body: {
        msg: "There was an error while trying to set notifications on your device, please, check your settings",
      },
    };
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { device },
      select: { device: true },
    });
    return { ok: true, data: { device: updated.device } };
  } catch {
    return {
      ok: false,
      status: 400,
      body: { msg: "Error de usuario" },
    };
  }
}

export async function clearDeviceToken(
  userId: string
): Promise<UserServiceResult<{ device: string | null }>> {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { device: null },
      select: { device: true },
    });
    return { ok: true, data: { device: updated.device } };
  } catch {
    return {
      ok: false,
      status: 400,
      body: { msg: "Error de usuario" },
    };
  }
}

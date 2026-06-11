import type { User } from "@prisma/client";

export type LegacyUserJson = {
  _id: string;
  name: string;
  email: string;
  username: string;
  date: string;
  firstTime: boolean;
  hasVerifiedMail: boolean;
  device: string | null;
  isPro: boolean;
  level: number;
};

export function serializeUser(user: User): LegacyUserJson {
  return {
    _id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? "",
    date: user.date.toISOString(),
    firstTime: user.firstTime,
    hasVerifiedMail: user.hasVerifiedMail,
    device: user.device,
    isPro: user.isPro,
    level: user.level ?? 0,
  };
}

export function serializeDeviceOnly(user: {
  device: string | null;
}): { device: string | null } {
  return { device: user.device };
}

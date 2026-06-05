import type { User } from "@prisma/client";

export type LegacyUserJson = {
  _id: string;
  name: string;
  email: string;
  date: string;
  firstTime: boolean;
  hasVerifiedMail: boolean;
  device: string | null;
  isPro: boolean;
};

export function serializeUser(user: User): LegacyUserJson {
  return {
    _id: user.id,
    name: user.name,
    email: user.email,
    date: user.date.toISOString(),
    firstTime: user.firstTime,
    hasVerifiedMail: user.hasVerifiedMail,
    device: user.device,
    isPro: user.isPro,
  };
}

export function serializeDeviceOnly(user: {
  device: string | null;
}): { device: string | null } {
  return { device: user.device };
}

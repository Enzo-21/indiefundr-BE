import { z } from "zod";

export const referralCodeBodySchema = z.object({
  code: z.string().trim().min(1).max(32),
});

import { z } from "zod";

export const subscribeBodySchema = z.object({
  fundId: z.string().min(1),
  cost: z.coerce.number(),
  device: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});

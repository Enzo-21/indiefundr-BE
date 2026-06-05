import { z } from "zod";

export const withdrawDestinationQuerySchema = z.object({
  address: z
    .string()
    .min(1, "Destination address is required")
    .max(64, "Destination address is too long"),
});

export const withdrawBodySchema = z.object({
  amountUsdt: z.coerce
    .number()
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount is too large"),
  destinationAddress: z
    .string({ required_error: "Destination address is required" })
    .min(1, "Destination address is required")
    .max(64, "Destination address is too long"),
  device: z.string().optional(),
});

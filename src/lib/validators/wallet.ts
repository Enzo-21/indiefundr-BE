import { z } from "zod";

export const addCustomWalletBodySchema = z.object({
  address: z
    .string({ required_error: "Wallet address is a required field" })
    .min(1, "Wallet address is a required field"),
  privateKey: z
    .string({ required_error: "Private Key is a required field" })
    .min(1, "Private Key is a required field"),
  name: z.string().optional(),
});

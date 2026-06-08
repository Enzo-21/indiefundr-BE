import type { NextConfig } from "next";
import { getDevAllowedOrigins } from "./scripts/dev-allowed-origins";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  ...(isDev ? { allowedDevOrigins: getDevAllowedOrigins() } : {}),
};

export default nextConfig;

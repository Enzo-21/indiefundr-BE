import os from "node:os";

/**
 * Origins allowed to load Next.js dev assets (/_next/*, HMR) when the browser
 * host differs from localhost — e.g. phone on http://192.168.x.x:3000.
 *
 * Only used when NODE_ENV !== "production".
 */
export function getDevAllowedOrigins(): string[] {
  const origins = new Set<string>([
    // Any IPv4 — survives DHCP changes without editing config or restarting.
    "*.*.*.*",
  ]);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        origins.add(addr.address);
      }
    }
  }

  return [...origins];
}

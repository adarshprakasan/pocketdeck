import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const allowedDevOrigins = Object.entries(networkInterfaces())
  .filter(([name]) => !/virtual|vpn|wsl|docker|hyper-v|loopback|vEthernet/i.test(name))
  .flatMap(([, entries]) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address) && !/^192\.168\.(56|65)\./.test(entry.address) && !/^172\.(17|18)\./.test(entry.address))
  .map((entry) => entry.address);

const nextConfig: NextConfig = { allowedDevOrigins, output: "standalone" };

export default nextConfig;

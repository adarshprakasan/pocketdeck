import type { NextConfig } from "next";
import { lanAddresses } from "./src/lib/network";

// Let phones on the local network load dev assets (npm run dev only).
const allowedDevOrigins = lanAddresses().map((entry) => entry.address);

const nextConfig: NextConfig = { allowedDevOrigins, output: "standalone" };

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing the dev server from devices on the local LAN (e.g. testing
  // the mobile layout from a phone). Next.js 16 blocks dev-resource requests
  // from origins other than localhost by default; listing the LAN IP here
  // restores HMR + static-chunk access for that host.
  allowedDevOrigins: ["192.168.1.151"],
};

export default nextConfig;

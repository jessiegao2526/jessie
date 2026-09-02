import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node.js server in addition to the Cloudflare build.
  // This lets the same GitHub source run on the Tencent Cloud VM for reliable
  // access from mainland China.
  output: "standalone",
};

export default nextConfig;

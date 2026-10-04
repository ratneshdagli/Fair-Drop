/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // In dev (no nginx) proxy /api to the gateway. In the compose stack nginx routes /api directly to the Go replicas.
  async rewrites() {
    const base = process.env.DEV_API_PROXY || "http://localhost:8088";
    return process.env.NODE_ENV === "production" ? [] : [{ source: "/api/:path*", destination: `${base}/api/:path*` }, { source: "/attack/:path*", destination: `${base}/attack/:path*` }];
  },
};
export default nextConfig;

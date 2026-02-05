process.env.NEXT_TELEMETRY_DISABLED = "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: ""
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: ""
      }
    ]
  }
};

module.exports = nextConfig;

// Enables local bindings support when developing against the Workers runtime.
const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
initOpenNextCloudflareForDev({ remoteBindings: false });

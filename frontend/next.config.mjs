/** @type {import('next').NextConfig} */
const version = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || "dev";

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8136",
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
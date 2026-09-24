import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const versionFile = path.resolve(__dirname, "../version.json");
const version = JSON.parse(fs.readFileSync(versionFile, "utf8")).version;

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8136",
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
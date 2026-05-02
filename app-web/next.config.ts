import type { NextConfig } from 'next';

const allowedDevOrigins = [
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS
    ? process.env.NEXT_ALLOWED_DEV_ORIGINS.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins,
};

export default nextConfig;

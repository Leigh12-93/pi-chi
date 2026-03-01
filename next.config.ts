import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['simple-git'],
  // Force clean webpack cache
  webpack: (config) => config,
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    config.cache = false
    config.parallelism = 1
    return config
  },
  transpilePackages: ['mapbox-gl'],
};

module.exports = nextConfig;

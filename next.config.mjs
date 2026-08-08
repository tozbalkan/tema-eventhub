import { createVanillaExtractPlugin } from '@vanilla-extract/next-plugin';

const withVanillaExtract = createVanillaExtractPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ['pg', 'pg-pool', 'pg-connection-string'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        pg: false,
        'pg-native': false,
        'pg-connection-string': false,
        util: false,
        'util/types': false,
        crypto: false,
        stream: false,
        path: false,
      };
    }
    return config;
  },
};

export default withVanillaExtract(nextConfig);

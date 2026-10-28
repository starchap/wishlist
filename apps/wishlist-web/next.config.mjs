import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  serverExternalPackages: ['sharp'],
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    externalDir: true
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@wishlist/lightly': path.resolve(workspaceRoot, 'libs/lightly/dist/index.js'),
      '@wishlist/lightly/icons': path.resolve(workspaceRoot, 'libs/lightly/dist/icons.js'),
      '@wishlist/shared-kernel': path.resolve(workspaceRoot, 'libs/shared/shared-kernel/src/index.ts'),
      '@wishlist/i18n': path.resolve(workspaceRoot, 'libs/shared/i18n/src/index.ts'),
      '@wishlist/database': path.resolve(workspaceRoot, 'libs/shared/database/src/index.ts'),
      '@wishlist/image-processor': path.resolve(
        workspaceRoot,
        'libs/shared/image-processor/src/index.ts'
      ),
      '@wishlist/chibi-theme': path.resolve(workspaceRoot, 'libs/shared/chibi-theme/src/index.ts'),
      '@wishlist/domain-iam/client': path.resolve(workspaceRoot, 'libs/domains/iam/src/client.ts'),
      '@wishlist/domain-iam': path.resolve(workspaceRoot, 'libs/domains/iam/src/index.ts'),
      '@wishlist/domain-wishlist/client': path.resolve(
        workspaceRoot,
        'libs/domains/wishlist/src/client.ts'
      ),
      '@wishlist/domain-wishlist': path.resolve(workspaceRoot, 'libs/domains/wishlist/src/index.ts'),
      '@wishlist/domain-metadata-importer/client': path.resolve(
        workspaceRoot,
        'libs/domains/metadata-importer/src/client.ts'
      ),
      '@wishlist/domain-metadata-importer': path.resolve(
        workspaceRoot,
        'libs/domains/metadata-importer/src/index.ts'
      ),
      '@wishlist/domain-gifting/client': path.resolve(
        workspaceRoot,
        'libs/domains/gifting/src/client.ts'
      ),
      '@wishlist/domain-gifting': path.resolve(workspaceRoot, 'libs/domains/gifting/src/index.ts'),
      '@wishlist/domain-coordination-chat/client': path.resolve(
        workspaceRoot,
        'libs/domains/coordination-chat/src/client.ts'
      ),
      '@wishlist/domain-coordination-chat': path.resolve(
        workspaceRoot,
        'libs/domains/coordination-chat/src/index.ts'
      )
    };
    return config;
  }
};

export default nextConfig;
